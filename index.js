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

class FieldDesc {
  constructor(name, desc) {
    this.init = desc.init
    this.applyTransform = desc.applyTransform || (state => state[name])
    this.applySelection = desc.applySelection || (state => state[name])
  }
}

function makeStateClass(fields, methods) {
  let fieldNames = Object.keys(fields)

  class EditorState {
    // :: Schema
    get schema() {
      return this.doc.type.schema
    }

    // :: (Object) → EditorState
    // Create a new state object by updating some of the fields in the
    // current object.
    update(updated) {
      let newInstance = new EditorState
      for (let i = 0; i < fieldNames.length; i++) {
        let name = fieldNames[i]
        newInstance[name] = hasProp(updated, name) ? updated[name] : this[name]
      }
      return newInstance
    }

    applyTransform(transform, options = nullOptions) {
      let newInstance = new EditorState
      for (let i = 0; i < fieldNames.length; i++)
        newInstance[fieldNames[i]] = fields[fieldNames[i]].applyTransform(this, transform, options)
      return newInstance
    }

    applySelection(selection, options = nullOptions) {
      let newInstance = new EditorState
      for (let i = 0; i < fieldNames.length; i++)
        newInstance[fieldNames[i]] = fields[fieldNames[i]].applySelection(this, selection, options)
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
      for (let i = 0; i < fieldNames.length; i++)
        instance[fieldNames[i]] = fields[fieldNames[i]].init(doc, selection)
      return instance
    }

    static fromSchema(schema) {
      return this.fromDoc(schema.nodes.doc.createAndFill())
    }

    static extend(spec) {
      let fieldCopy = {}, methodCopy = {}
      Object.keys(fields).forEach(name => fieldCopy[name] = fields[name])
      Object.keys(methods).forEach(name => methodCopy[name] = methods[name])

      Object.keys(spec.fields || {}).forEach(name => {
        if (hasProp(fields, name) || hasProp(EditorState.prototype, name))
          throw new Error("Conflicting definition for state property " + name)
        fieldCopy[name] = new FieldDesc(name, spec.fields[name])
      })
      Object.keys(spec.methods || {}).forEach(name => {
        if (hasProp(fields, name) || hasProp(EditorState.prototype, name))
          throw new Error("Conflicting definition for state property " + name)
        methodCopy[name] = spec.methods[name]
      })
      return makeStateClass(fieldCopy, methodCopy)
    }
  }

  Object.keys(methods).forEach(name => EditorState.prototype[name] = methods[name])

  return EditorState
}

exports.EditorState = makeStateClass({
  doc: new FieldDesc("doc", {
    init(doc) { return doc },
    applyTransform(state, transform) {
      if (!transform.before.eq(state.doc))
        throw new RangeError("Applying a transform that does not start with the current document")
      return transform.doc
    }
  }),

  selection: new FieldDesc("selection", {
    init(_, selection) { return selection },
    applyTransform(state, transform, options) {
      return options.selection || state.selection.map(transform.doc, transform.mapping)
    },
    applySelection(_, selection) { return selection }
  }),

  storedMarks: new FieldDesc("storedMarks", {
    init() { return null },
    applyTransform(state, _, options) { return options.selection ? null : state.storedMarks },
    applySelection() { return null }
  }),

  view: new FieldDesc("view", {
    init() { return ViewState.initial },
    applyTransform(state, transform, options) {
      return new ViewState(state.view.inDOMChange,
                           state.view.domChangeMapping && state.view.domChangeMapping.copy().appendMapping(transform.mapping),
                           options.scrollIntoView ? true : options.selection ? false : state.view.scrollToSelection)
    },
    applySelection(state, _, options) {
      return new ViewState(state.view.inDOMChange, state.view.domChangeMapping, !!options.scrollIntoView)
    }
  })
}, {})
