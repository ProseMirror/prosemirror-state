// !! This module implements the state object of a ProseMirror editor.

const {Mark} = require("../model")
const {Selection} = require("../selection")
const {Remapping} = require("../transform")

const {EditorTransform} = require("./transform")
exports.EditorTransform = EditorTransform

function currentMarks(doc, selection) {
  return selection.head == null ? Mark.none : doc.marksAt(selection.head)
}

const nullOptions = {}

function hasProp(obj, prop) {
  return Object.prototype.hasOwnProperty.call(obj, prop)
}

function editorStateClass(fields) {
  const fieldNames = Object.keys(fields)

  class EditorState {
    constructor(doc, selection, storedMarks, updated, preserved) {
      this.doc = doc
      this.selection = selection
      this.storedMarks = storedMarks
      for (let i = 0; i < fieldNames.length; i++) {
        let name = fieldNames[i]
        this[name] = updated && hasProp(updated, name) ? updated[name] : preserved[name]
      }
    }

    // :: Schema
    get schema() {
      return this.doc.type.schema
    }

    applyTransform(transform, options = nullOptions) {
      if (!transform.docs[0].eq(this.doc))
        throw new RangeError("Applying a transform that does not start with the current document")
      let updated = {}
      for (let i = 0; i < fieldNames.length; i++) {
        let name = fieldNames[i], val = this[name]
        if (val && val.applyTransform)
          updated[name] = val.applyTransform(transform, options)
      }
      return new EditorState(transform.doc,
                             options.selection || this.selection.map(transform.doc, transform.mapping),
                             options.selection ? null : this.storedMarks,
                             updated, this)
    }

    applySelection(selection, options = nullOptions) {
      let updated = {}
      for (let i = 0; i < fieldNames.length; i++) {
        let name = fieldNames[i], val = this[name]
        if (val && val.applySelection)
          updated[name] = val.applySelection(selection, options)
      }
      return new EditorState(this.doc, selection, null, updated, this)
    }

    addActiveMark(mark) {
      if (!this.selection.empty) return this
      return new EditorState(this.doc, this.selection,
                             mark.addToSet(this.storedMarks || currentMarks(this.doc, this.selection)),
                             null, this)
    }

    removeActiveMark(markType) {
      if (!this.selection.empty) return this
      return new EditorState(this.doc, this.selection,
                             markType.removeFromSet(this.storedMarks || currentMarks(this.doc, this.selection)),
                             null, this)
    }

    // :: EditorTransform
    // Create a selection-aware `Transform` object.
    get tr() { return new EditorTransform(this) }

    update(fields) {
      return new EditorState(this.doc || this.doc,
                             this.selection || this.selection,
                             this.storedMarks || this.storedMarks,
                             fields, this)
    }

    static fromDoc(doc, selection) {
      if (!selection) selection = Selection.atStart(doc)
      let initial = {}
      fieldNames.forEach(name => initial[name] = fields[name](doc, selection))
      return new EditorState(doc, selection, null, initial)
    }

    static fromSchema(schema) {
      return this.fromDoc(schema.nodes.doc.createAndFill())
    }

    static extend(addFields) {
      let newFields = {}
      fieldNames.forEach(name => newFields[name] = fields[name])
      for (let name in addFields) if (hasProp(addFields, name)) newFields[name] = addFields[name]
      return editorStateClass(newFields)
    }
  }
  return EditorState
}

class ViewState {
  constructor(inDOMChange, domChangeMapping, scrollToSelection) {
    this.inDOMChange = inDOMChange
    this.domChangeMapping = domChangeMapping
    this.scrollToSelection = scrollToSelection
  }

  startDOMChange(id) {
    return new ViewState(id, new Remapping, this.scrollToSelection)
  }

  endDOMChange() {
    return new ViewState(null, null, this.scrollToSelection)
  }

  applyTransform(transform, options) {
    return new ViewState(this.inDOMChange,
                         this.domChangeMapping && this.domChangeMapping.copy().appendMapping(transform.mapping),
                         options.scrollIntoView ? true : options.selection ? false : this.scrollToSelection)
  }

  applySelection(_selection, options) {
    return new ViewState(this.inDOMChange, this.domChangeMapping, !!options.scrollIntoView)
  }
}
ViewState.initial = new ViewState(null, null, false)
exports.ViewState = ViewState

exports.EditorState = editorStateClass({view: () => ViewState.initial})
