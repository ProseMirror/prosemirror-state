// !! This module implements the state object of a ProseMirror editor.

const {Mark} = require("../model")
const {Selection} = require("../selection")
const {Remapping} = require("../transform")

const {EditorTransform} = require("./transform")
exports.EditorTransform = EditorTransform

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

function currentMarks(doc, selection) {
  return selection.head == null ? Mark.none : doc.marksAt(selection.head)
}

const nullOptions = {}

class EditorState {
  constructor(doc, selection, storedMarks, view) {
    this.doc = doc
    this.selection = selection
    this.storedMarks = storedMarks
    this.view = view
  }

  // :: Schema
  get schema() {
    return this.doc.type.schema
  }

  applyTransform(transform, options = nullOptions) {
    if (!transform.docs[0].eq(this.doc))
      throw new RangeError("Applying a transform that does not start with the current document")
    return new EditorState(transform.doc,
                           options.selection || this.selection.map(transform.doc, transform.mapping),
                           options.selection ? null : this.storedMarks,
                           this.view.applyTransform(transform, options))
  }

  applySelection(selection, options = nullOptions) {
    return new EditorState(this.doc, selection, null, this.view.applySelection(selection, options))
  }

  addActiveMark(mark) {
    if (!this.selection.empty) return this
    return new EditorState(this.doc, this.selection,
                           mark.addToSet(this.storedMarks || currentMarks(this.doc, this.selection)),
                           this.view)
  }

  removeActiveMark(markType) {
    if (!this.selection.empty) return this
    return new EditorState(this.doc, this.selection,
                           markType.removeFromSet(this.storedMarks || currentMarks(this.doc, this.selection)),
                           this.view)
  }

  // :: EditorTransform
  // Create a selection-aware `Transform` object.
  get tr() { return new EditorTransform(this) }

  update(fields) {
    return new EditorState(fields.doc || this.doc,
                           fields.selection || this.selection,
                           fields.storedMarks || this.storedMarks,
                           fields.view || this.view)
  }

  static fromDoc(doc, selection) {
    return new EditorState(doc, selection || Selection.atStart(doc), null, ViewState.initial)
  }

  static fromSchema(schema) {
    return this.fromDoc(schema.nodes.doc.createAndFill())
  }
}
exports.EditorState = EditorState
