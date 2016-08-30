// !! This module implements the state object of a ProseMirror editor.

const {Mark, Node} = require("../model")
const {Mapping} = require("../transform")

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
    applyAction(state, action) {
      return action.type == "transform" ? action.transform.doc : state.doc
    },
    toJSON(value) { return value.toJSON() },
    fromJSON(config, json) { return Node.fromJSON(config.schema, json) }
  }),

  new FieldDesc("selection", {
    init(config, instance) { return config.selection || Selection.atStart(instance.doc) },
    applyAction(state, action) {
      if (action.type == "transform")
        return action.selection || state.selection.map(action.transform.doc, action.transform.mapping)
      if (action.type == "selection")
        return action.selection
      return state.selection
    },
    toJSON(value) { return value.toJSON() },
    fromJSON(_, json, instance) { return Selection.fromJSON(instance.doc, json) }
  }),

  new FieldDesc("storedMarks", {
    init() { return null },
    applyAction(state, action) {
      if (action.type == "transform") return action.selection ? null : state.storedMarks
      if (action.type == "selection") return null
      if (action.type == "addStoredMark" && state.selection.empty)
        return action.mark.addToSet(state.storedMarks || currentMarks(state.doc, state.selection))
      if (action.type == "removeStoredMark" && state.selection.empty)
        return action.markType.removeFromSet(state.storedMarks || currentMarks(state.doc, state.selection))
      return state.storedMarks
    }
  }),

  new FieldDesc("view", {
    init() { return ViewState.initial },
    applyAction(state, action) {
      let view = state.view
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

class PluginSet {
  constructor(plugins) {
    this.fields = baseFields.slice()
    this.plugins = []
    if (plugins) plugins.forEach(plugin => {
      this.plugins.push(plugin)
      if (plugin.stateFields) for (let name in plugin.stateFields) if (plugin.stateFields.hasOwnProperty(name)) {
        if (name == "_pluginSet" || EditorState.prototype.hasOwnProperty(name) ||
            this.fields.some(field => field.name == name))
          throw new Error("Conflicting definition for state property " + name)
        this.fields.push(new FieldDesc(name, plugin.stateFields[name]))
      }
    })
  }
}

class EditorState {
  constructor(pluginSet) {
    this._pluginSet = pluginSet
  }

  // :: [Object]
  get plugins() {
    return this._pluginSet.plugins
  }

  // :: Schema
  get schema() {
    return this.doc.type.schema
  }

  applyAction(action) {
    let newInstance = new EditorState(this._pluginSet), fields = this._pluginSet.fields
    for (let i = 0; i < fields.length; i++)
      newInstance[fields[i].name] = fields[i].applyAction(this, action)
    return newInstance
  }

  // :: EditorTransform
  // Create a selection-aware `Transform` object.
  get tr() { return new EditorTransform(this) }

  static create(config) {
    let pluginSet = new PluginSet(config.plugins), instance = new EditorState(pluginSet)
    for (let i = 0; i < pluginSet.fields.length; i++)
      instance[pluginSet.fields[i].name] = pluginSet.fields[i].init(config, instance)
    return instance
  }

  reconfigure(config) {
    let pluginSet = new PluginSet(config.plugins), fields = pluginSet.fields, instance = new EditorState(pluginSet)
    for (let i = 0; i < fields.length; i++) {
      let name = fields[i].name
      if (this._pluginSet.fields.some(f => f.name == name))
        instance[name] = this[name]
      else
        instance[name] = fields[i].init(config, instance)
    }
    return instance
  }

  toJSON(options) {
    let result = {}, fields = this._pluginSet.fields
    let ignore = options && options.ignore || []
    for (let i = 0; i < fields.length; i++) {
      let field = fields[i]
      let json = field.toJSON && ignore.indexOf(field.name) == -1 ? field.toJSON(this[field.name]) : null
      if (json != null) result[field.name] = json
    }
    return result
  }

  static fromJSON(config, json) {
    let pluginSet = new PluginSet(config.plugins), fields = pluginSet.fields, instance = new EditorState(pluginSet)
    for (let i = 0; i < fields.length; i++) {
      let field = pluginSet.fields[i], value = json[field.name]
      if (value == null || !field.fromJSON) instance[field.name] = field.init(config, instance)
      else instance[field.name] = field.fromJSON(config, value, instance)
    }
    return instance
  }
}
exports.EditorState = EditorState
