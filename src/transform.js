const {Transform} = require("prosemirror-transform")
const {Selection} = require("./selection")

// ::- A selection-aware extension of `Transform`. Use
// [`EditorState.tr`](#state.EditorState.tr) to create an instance.
class EditorTransform extends Transform {
  constructor(state) {
    super(state.doc)
    this.state = state
    this.curSelection = state.selection
    this.curSelectionAt = 0
    this.selectionSet = false
  }

  // :: Selection
  // The transform's current selection. This defaults to the
  // editor selection [mapped](#state.Selection.map) through the steps in
  // this transform, but can be overwritten with
  // [`setSelection`](#state.EditorTransform.setSelection).
  get selection() {
    if (this.curSelectionAt < this.steps.length) {
      this.curSelection = this.curSelection.map(this.doc, this.mapping.slice(this.curSelectionAt))
      this.curSelectionAt = this.steps.length
    }
    return this.curSelection
  }

  // :: (Selection) → EditorTransform
  // Update the transform's current selection. This will determine the
  // selection that the editor gets when the transform is applied.
  setSelection(selection) {
    this.curSelection = selection
    this.curSelectionAt = this.steps.length
    this.selectionSet = true
    return this
  }

  // :: (Slice) → EditorTransform
  replaceSelection(slice) {
    let {from, to} = this.selection, startLen = this.steps.length
    this.replaceRange(from, to, slice)
    // Move the selection to the position after the inserted content.
    // When that ended in an inline node, search backwards, to get the
    // position after that node. If not, search forward.
    let lastNode = slice.content.lastChild, lastParent = null
    for (let i = 0; i < slice.openRight; i++) {
      lastParent = lastNode
      lastNode = lastNode.lastChild
    }
    selectionToInsertionEnd(this, startLen, (lastNode ? lastNode.isInline : lastParent && lastParent.isTextblock) ? -1 : 1)
    return this
  }

  // :: (Node, ?bool) → EditorTransform
  // Replace the selection with the given node or slice, or delete it
  // if `content` is null. When `inheritMarks` is true and the content
  // is inline, it inherits the marks from the place where it is
  // inserted.
  replaceSelectionWith(node, inheritMarks) {
    let {from, to} = this.selection, startLen = this.steps.length
    if (inheritMarks !== false)
      node = node.mark(this.state.storedMarks || this.doc.marksAt(from, to > from))
    this.replaceRangeWith(from, to, node)
    selectionToInsertionEnd(this, startLen, node.isInline ? -1 : 1)
    return this
  }

  // :: () → EditorTransform
  // Delete the selection.
  deleteSelection() {
    let {from, to} = this.selection
    return this.deleteRange(from, to)
  }

  // :: (string, from: ?number, to: ?number) → EditorTransform
  // Replace the given range, or the selection if no range is given,
  // with a text node containing the given string.
  insertText(text, from, to = from) {
    if (from == null) {
      if (!text) return this.deleteSelection()
      return this.replaceSelectionWith(this.state.schema.text(text), true)
    } else {
      if (!text) return this.deleteRange(from, to)
      let node = this.state.schema.text(text, this.state.storedMarks || this.doc.marksAt(from, to > from))
      return this.replaceRangeWith(from, to, node)
    }
  }

  // :: (?Object) → TransformAction
  // Create a transform action. `options` can be given to add extra
  // properties to the action object.
  action(options) {
    let action = {type: "transform",
                  transform: this,
                  selection: this.selectionSet ? this.selection : null,
                  time: Date.now()}
    if (options) for (let prop in options) action[prop] = options[prop]
    return action
  }

  // :: () → TransformAction
  // Create a transform action with the `scrollIntoView` property set
  // to true (this is common enough to warrant a shortcut method).
  scrollAction() {
    return this.action({scrollIntoView: true})
  }
}
exports.EditorTransform = EditorTransform

function selectionToInsertionEnd(tr, startLen, bias) {
  if (tr.steps.length == startLen) return
  let map = tr.mapping.maps[tr.mapping.maps.length - 1], end
  map.forEach((_from, _to, _newFrom, newTo) => end = newTo)
  if (end != null) tr.setSelection(Selection.near(tr.doc.resolve(end), bias))
}

// :: (Action, (transform: Transform)) → Action
// If, when dispatching actions, you need to extend a transform action
// with additional steps, you can use this helper. It takes an action
// and a function that extends a transform, and will update the action
// to reflect any additional steps. It won't call the function if the
// action is not a transform action or a
// [sealed](#state.TransformAction.sealed) transform action.
function extendTransformAction(action, f) {
  if (action.type != "transform" || action.sealed) return action
  let tr = action.transform, steps = tr.steps.length, set = tr.selectionSet
  f(tr)
  if (!set && tr.selectionSet)
    action.selection = tr.selection
  else if (action.selection && tr.steps.length > steps)
    action.selection = action.selection.map(tr.doc, tr.mapping.slice(steps))
  return action
}
exports.extendTransformAction = extendTransformAction
