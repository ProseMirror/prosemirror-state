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
    this.toJSON = desc.toJSON || (() => null)
    this.fromJSON = desc.fromJSON || ((config, _, instance) => this.init(config, instance))
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
    toJSON(value) { return Selection.toJSON(value) },
    fromJSON(_, json, instance) { return Selection.fromJSON(instance.doc, json) }
  }),

  new FieldDesc("storedMarks", {
    init() { return null },
    applyAction(state, action) {
      if (state.type == "transform") return action.selection ? null : state.storedMarks
      if (state.type == "selection") return null
      if (state.type == "addStoredMark" && state.selection.empty)
        return action.mark.addToSet(state.storedMarks || currentMarks(state.doc, state.selection))
      if (state.type == "removeStoredMark" && state.selection.empty)
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

function resolveFields(config) {
  let fields = baseFields.slice()
  if (config.plugins) for (let i = 0; i < config.plugins.length; i++) {
    let plugin = config.plugins[i]
    if (plugin.stateFields) for (let name in plugin.stateFields) if (plugin.stateFields.hasOwnProperty(name)) {
      let conflict = name == "fields" || EditorState.prototype.hasOwnProperty(name)
      for (let j = 0; j < fields.length; j++) if (fields[j].name == name) conflict = true
      if (conflict) throw new Error("Conflicting definition for state field " + name)
      fields.push(new FieldDesc(name, plugin.stateFields[name]))
    }
  }
  return fields
}

class EditorState {
  constructor(fields) {
    this.fields = fields
  }

  // :: Schema
  get schema() {
    return this.doc.type.schema
  }

  applyAction(action) {
    let newInstance = new EditorState(this.fields)
    for (let i = 0; i < this.fields.length; i++)
      newInstance[this.fields[i].name] = this.fields[i].applyAction(this, action)
    return newInstance
  }

  // :: EditorTransform
  // Create a selection-aware `Transform` object.
  get tr() { return new EditorTransform(this) }

  static create(config) {
    let fields = resolveFields(config), instance = new EditorState(fields)
    for (let i = 0; i < fields.length; i++)
      instance[fields[i].name] = fields[i].init(config, instance)
    return instance
  }

  toJSON() {
    let result = {}
    for (let i = 0; i < this.fields.length; i++) {
      let field = this.fields[i], json = field.toJSON(this[field.name])
      if (json != null) result[field.name] = json
    }
    return result
  }

  fromJSON(config, json) {
    let fields = resolveFields(config), instance = new EditorState(fields)
    for (let i = 0; i < fields.length; i++)
      instance[fields[i].name] = fields[i].init(config, json[fields[i].name], instance)
    return instance
  }
}
exports.EditorState = EditorState
