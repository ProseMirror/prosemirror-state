// !! This module implements the state object of a ProseMirror editor.

const {Mark} = require("../model")
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
  }
}

const baseFields = [
  new FieldDesc("doc", {
    init(config) { return config.doc },
    applyAction(state, action) {
      return action.type == "transform" ? action.transform.doc : state.doc
    }
  }),

  new FieldDesc("selection", {
    init(config) { return config.selection },
    applyAction(state, action) {
      if (action.type == "transform")
        return action.selection || state.selection.map(action.transform.doc, action.transform.mapping)
      if (action.type == "selection")
        return action.selection
      return state.selection
    }
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

function buildStateClass(plugins) {
  let fields = baseFields.slice()

  class EditorState {
    // :: Schema
    get schema() {
      return this.doc.type.schema
    }

    applyAction(action) {
      let newInstance = new EditorState
      for (let i = 0; i < fields.length; i++)
        newInstance[fields[i].name] = fields[i].applyAction(this, action)
      return newInstance
    }

    // :: EditorTransform
    // Create a selection-aware `Transform` object.
    get tr() { return new EditorTransform(this) }

    static create(config) {
      if (!config.doc) config.doc = config.schema.nodes.doc.createAndFill()
      if (!config.selection) config.selection = Selection.atStart(config.doc)
      let instance = new EditorState
      for (let i = 0; i < fields.length; i++)
        instance[fields[i].name] = fields[i].init(config)
      return instance
    }
  }

  plugins.forEach(plugin => {
    if (plugin.stateFields) Object.keys(plugin.stateFields).forEach(name => {
      if (fields.some(f => f.name == name) || EditorState.prototype.hasOwnProperty(name))
        throw new Error("Conflicting definition for state field " + name)
      fields.push(new FieldDesc(name, plugin.stateFields[name]))
    })
  })

  return EditorState
}
exports.buildStateClass = buildStateClass

function currentMarks(doc, selection) {
  return selection.head == null ? Mark.none : doc.marksAt(selection.head)
}
