// !! This module implements the state object of a ProseMirror editor.

const {Mark} = require("../model")
const {Mapping} = require("../transform")

const {Selection, TextSelection, NodeSelection} = require("./selection")
exports.Selection = Selection; exports.TextSelection = TextSelection; exports.NodeSelection = NodeSelection
const {EditorTransform} = require("./transform")
exports.EditorTransform = EditorTransform

function currentMarks(doc, selection) {
  return selection.head == null ? Mark.none : doc.marksAt(selection.head)
}

const nullOptions = {}

function hasProp(obj, prop) {
  return Object.prototype.hasOwnProperty.call(obj, prop)
}

class ViewState {
  constructor(inDOMChange, domChangeMapping, scrollToSelection) {
    this.inDOMChange = inDOMChange
    this.domChangeMapping = domChangeMapping
    this.scrollToSelection = scrollToSelection
  }
}
ViewState.initial = new ViewState(null, null, false)
exports.ViewState = ViewState

const baseFields = {
  doc: {
    init(doc) { return doc },
    applyTransform(state, transform) {
      if (!transform.before.eq(state.doc))
        throw new RangeError("Applying a transform that does not start with the current document")
      return transform.doc
    }
  },
  selection: {
    init(_, selection) { return selection },
    applyTransform(state, transform, options) {
      return options.selection || state.selection.map(transform.doc, transform.mapping)
    },
    applySelection(_, selection) { return selection }
  },
  storedMarks: {
    init() { return null },
    applyTransform(state, _, options) { return options.selection ? null : state.storedMarks },
    applySelection() { return null }
  },

  view: {
    init() { return ViewState.initial },
    applyTransform(state, transform, options) {
      return new ViewState(state.view.inDOMChange,
                           state.view.domChangeMapping && state.view.domChangeMapping.copy().appendMapping(transform.mapping),
                           options.scrollIntoView ? true : options.selection ? false : state.view.scrollToSelection)
    },
    applySelection(state, _, options) {
      return new ViewState(state.view.inDOMChange, state.view.domChangeMapping, !!options.scrollIntoView)
    }
  }
}

function makeStateClass(plugins = []) {
  let fieldNames, descs = {}

  class EditorState {
    // :: (Object) → EditorState
    // Create a new state object by updating some of the fields in the
    // current object.
    update(fields) {
      let newInstance = new EditorState
      for (let i = 0; i < fieldNames.length; i++) {
        let name = fieldNames[i]
        newInstance[name] = hasProp(fields, name) ? fields[name] : this[name]
      }
      return newInstance
    }

    // :: Schema
    get schema() {
      return this.doc.type.schema
    }

    applyTransform(transform, options = nullOptions) {
      let newInstance = new EditorState
      for (let i = 0; i < fieldNames.length; i++) {
        let name = fieldNames[i], desc = descs[name]
        newInstance[name] = desc.applyTransform ? desc.applyTransform(this, transform, options) : this[name]
      }
      return newInstance
    }

    applySelection(selection, options = nullOptions) {
      let newInstance = new EditorState
      for (let i = 0; i < fieldNames.length; i++) {
        let name = fieldNames[i], desc = descs[name]
        newInstance[name] = desc.applySelection ? desc.applySelection(this, selection, options) : this[name]
      }
      return newInstance
    }

    addActiveMark(mark) {
      let set = this.storedMarks
      if (this.selection.empty) set = mark.addToSet(set || currentMarks(this.doc, this.selection))
      return set == this.storedMarks ? this : this.update({storedMarks: set})
    }

    removeActiveMark(markType) {
      let set = this.storedMarks
      if (this.selection.empty) set = markType.removeFromSet(set || currentMarks(this.doc, this.selection))
      return set == this.storedMarks ? this : this.update({storedMarks: set})
    }

    startDOMChange(id) {
      return this.update({view: new ViewState(id, new Mapping, this.view.scrollToSelection)})
    }

    endDOMChange() {
      return this.update({view: new ViewState(null, null, this.view.scrollToSelection)})
    }

    // :: EditorTransform
    // Create a selection-aware `Transform` object.
    get tr() { return new EditorTransform(this) }

    static fromDoc(doc, selection) {
      if (!selection) selection = Selection.atStart(doc)
      let instance = new EditorState
      for (let i = 0; i < fieldNames.length; i++) {
        let name = fieldNames[i]
        instance[name] = descs[name].init(doc, selection)
      }
      return instance
    }

    static fromSchema(schema) {
      return this.fromDoc(schema.nodes.doc.createAndFill())
    }
  }

  Object.keys(baseFields).forEach(name => descs[name] = baseFields[name])
  plugins.forEach(plugin => {
    Object.keys(plugin.stateFields || {}).forEach(field => {
      if (hasProp(descs, field) || hasProp(EditorState.prototype, field))
        throw new Error("Conflicting definition for state property " + field)
      descs[field] = plugin.stateFields[field]
    })
    Object.keys(plugin.stateMethods || {}).forEach(method => {
      if (hasProp(descs, method) || hasProp(EditorState.prototype, method))
        throw new Error("Conflicting definition for state property " + method)
      EditorState.prototype[method] = plugin.stateMethods[method]
    })
  })
  fieldNames = Object.keys(descs)

  return EditorState
}
exports.makeStateClass = makeStateClass

exports.EditorState = makeStateClass([])
