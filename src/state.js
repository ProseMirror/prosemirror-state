const {Mark, Node} = require("prosemirror-model")
const {Mapping} = require("prosemirror-transform")

const {Selection} = require("./selection")
const {EditorTransform} = require("./transform")

class ViewState {
  constructor(inDOMChange, domChangeMapping, scrollToSelection) {
    this.inDOMChange = inDOMChange
    this.domChangeMapping = domChangeMapping
    this.scrollToSelection = scrollToSelection
  }
}
ViewState.initial = new ViewState(null, null, false)
exports.ViewState = ViewState

class FieldDesc {
  constructor(name, desc) {
    this.name = name
    this.init = desc.init
    this.applyAction = desc.applyAction
    this.toJSON = desc.toJSON
    this.fromJSON = desc.fromJSON
  }
}

const baseFields = [
  new FieldDesc("doc", {
    init(config) { return config.doc || config.schema.nodes.doc.createAndFill() },
    applyAction(action, doc) {
      return action.type == "transform" ? action.transform.doc : doc
    },
    toJSON(value) { return value.toJSON() },
    fromJSON(config, json) { return Node.fromJSON(config.schema, json) }
  }),

  new FieldDesc("selection", {
    init(config, instance) { return config.selection || Selection.atStart(instance.doc) },
    applyAction(action, selection) {
      if (action.type == "transform")
        return action.selection || selection.map(action.transform.doc, action.transform.mapping)
      if (action.type == "selection")
        return action.selection
      return selection
    },
    toJSON(value) { return value.toJSON() },
    fromJSON(_, json, instance) { return Selection.fromJSON(instance.doc, json) }
  }),

  new FieldDesc("storedMarks", {
    init() { return null },
    applyAction(action, storedMarks, state) {
      if (action.type == "transform") return action.selection ? null : storedMarks
      if (action.type == "selection") return null
      if (action.type == "addStoredMark" && state.selection.empty)
        return action.mark.addToSet(storedMarks || currentMarks(state.doc, state.selection))
      if (action.type == "removeStoredMark" && state.selection.empty)
        return action.markType.removeFromSet(storedMarks || currentMarks(state.doc, state.selection))
      return storedMarks
    }
  }),

  new FieldDesc("view", {
    init() { return ViewState.initial },
    applyAction(action, view) {
      if (action.type == "transform")
        return new ViewState(view.inDOMChange,
                             view.domChangeMapping && view.domChangeMapping.copy().appendMapping(action.transform.mapping),
                             action.scrollIntoView ? true : action.selection ? false : view.scrollToSelection)
      if (action.type == "selection")
        return new ViewState(view.inDOMChange, view.domChangeMapping, action.scrollIntoView)
      if (action.type == "startDOMChange")
        return new ViewState(action.id, new Mapping, view.scrollToSelection)
      if (action.type == "endDOMChange")
        return new ViewState(null, null, view.scrollToSelection)
      return view
    }
  })
]

function currentMarks(doc, selection) {
  return selection.head == null ? Mark.none : doc.marksAt(selection.head)
}

class Configuration {
  constructor(schema, plugins) {
    this.schema = schema
    this.fields = baseFields.slice()
    this.plugins = []
    if (plugins) plugins.forEach(plugin => this.addPlugin(plugin))
  }

  addPlugin(plugin) {
    let deps = plugin.options.dependencies, found
    if (deps) deps.forEach(plugin => this.addPlugin(plugin))
    if (found = this.findPlugin(plugin)) {
      if (found == plugin) return
      throw new RangeError("Adding different configurations of the same plugin")
    }

    this.plugins.push(plugin)
    let field = plugin.options.state
    if (field) this.fields.push(new FieldDesc(plugin.id, field))
  }

  findPlugin(plugin) {
    for (let i = 0; i < this.plugins.length; i++)
      if (this.plugins[i].id == plugin.id) return this.plugins[i]
  }
}

// ::- The state of a ProseMirror editor is represented by an object
// of this type. This is a persistent data structure—it isn't updated,
// but rather a new state value is computed from an old one with the
// [`applyAction`](state.EditorState.applyAction) method.
//
// In addition to the built-in state fields, plugins can define
// additional pieces of state.
class EditorState {
  constructor(config) {
    this.config = config
  }

  // doc:: Node
  // The current document.

  // selection:: Selection
  // The selection.

  // storedMarks:: ?[Mark]
  // A set of marks to apply to the next character that's typed. Will
  // be null whenever no explicit marks have been set.

  // :: Schema
  // The schema of the state's document.
  get schema() {
    return this.config.schema
  }

  // :: [Plugin]
  // The plugins that are active in this state.
  get plugins() {
    return this.config.plugins
  }

  // :: (Action) → EditorState
  // Apply the given action to produce a new state.
  applyAction(action) {
    let newInstance = new EditorState(this.config), fields = this.config.fields
    for (let i = 0; i < fields.length; i++) {
      let field = fields[i]
      newInstance[field.name] = field.applyAction(action, this[field.name], this)
    }
    return newInstance
  }

  // :: EditorTransform
  // Create a selection-aware [`Transform` object](#state.EditorTransform).
  get tr() { return new EditorTransform(this) }

  // :: (Object) → EditorState
  // Create a state. `config` must be an object containing at least a
  // `schema` (the schema to use) or `doc` (the starting document)
  // property. When it has a `selection` property, that should be a
  // valid [selection](#state.Selection) in the given document, to use
  // as starting selection. Plugins, which are specified as an array
  // in the `plugins` property, may read additional fields from the
  // config object.
  static create(config) {
    let $config = new Configuration(config.schema || config.doc.type.schema, config.plugins)
    let instance = new EditorState($config)
    for (let i = 0; i < $config.fields.length; i++)
      instance[$config.fields[i].name] = $config.fields[i].init(config, instance)
    return instance
  }

  // :: (Object) → EditorState
  // Create a new state based on this one, but with an adjusted set of
  // active plugins. State fields that exist in both sets of plugins
  // are kept unchanged. Those that no longer exist are dropped, and
  // those that are new are initialized using their
  // [`init`](#state.StateField.init) method, passing in the new
  // configuration object..
  reconfigure(config) {
    let $config = new Configuration(config.schema || this.schema, config.plugins)
    let fields = $config.fields, instance = new EditorState($config)
    for (let i = 0; i < fields.length; i++) {
      let name = fields[i].name
      if (this.config.fields.some(f => f.name == name))
        instance[name] = this[name]
      else
        instance[name] = fields[i].init(config, instance)
    }
    return instance
  }

  // :: (?Object) → Object
  // Convert this state to a JSON-serializable object. When the
  // `ignore` option is given, it is interpreted as an array of
  // plugins whose state should not be serialized.
  toJSON(options) {
    let result = {}, fields = this.config.fields
    let ignore = (options && options.ignore || []).map(p => p.id)
    for (let i = 0; i < fields.length; i++) {
      let field = fields[i]
      let json = field.toJSON && ignore.indexOf(field.name) == -1 ? field.toJSON(this[field.name]) : null
      if (json != null) result[field.name] = json
    }
    return result
  }

  // :: (Object, Object) → EditorState
  // Deserialize a JSON representation of a state. `config` should
  // have at least a `schema` field, and should contain array of
  // plugins to initialize the state with. It is also passed as
  // starting configuration for fields that were not serialized.
  static fromJSON(config, json) {
    if (!config.schema) throw new RangeError("Required config field 'schema' missing")
    let $config = new Configuration(config.schema, config.plugins), fields = $config.fields, instance = new EditorState($config)
    for (let i = 0; i < fields.length; i++) {
      let field = fields[i], value = json[field.name]
      if (value == null || !field.fromJSON) instance[field.name] = field.init(config, instance)
      else instance[field.name] = field.fromJSON(config, value, instance)
    }
    return instance
  }
}
exports.EditorState = EditorState

// Action:: interface
// State updates are performed through actions, which are objects that
// describe the update.
//
//  type:: string
//  The type of this action. This determines the way the action is
//  interpreted, and which other fields it should have.

// TransformAction:: interface
// An action type that transforms the state's document. Applying this
// will create a state in which the document is the result of this
// transformation.
//
//   type:: "transform"
//
//   transform:: Transform
//
//   selection:: ?Selection
//   If given, this selection will be used as the new selection. If
//   not, the old selection is mapped through the transform.
//
//   scrollIntoView:: ?bool
//   When true, the next display update will scroll the cursor into
//   view.

// SelectionAction:: interface
// An action that updates the selection.
//
//   type:: "selection"
//
//   selection:: Selection
//   The new selection.
//
//   scrollIntoView:: ?bool
//   When true, the next display update will scroll the cursor into
//   view.

// AddStoredMarkAction:: interface
// An action type that adds a stored mark to the state.
//
//   type:: "addStoredMark"
//
//   mark:: Mark

// RemoveStoredMarkAction:: interface
// An action type that removes a stored mark from the state.
//
//   type:: "removeStoredMark"
//
//   markType:: MarkType
