const {Fragment} = require("../model")
const {Transform, insertPoint} = require("../transform")
const {Selection} = require("./selection")

// ;; A selection-aware extension of `Transform`. Use `EditorState.tr`
// to create an instance.
class EditorTransform extends Transform {
  constructor(state) {
    super(state.doc)
    this.storedMarks = state.storedMarks
    this.curSelection = state.selection
    this.curSelectionAt = 0
    this.selectionSet = false
  }

  // :: Selection
  // The transform's current selection. This defaults to the
  // editor selection [mapped](#Selection.map) through the steps in
  // this transform, but can be overwritten with
  // [`setSelection`](#EditorTransform.setSelection).
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

  // :: (?Node, ?bool) → EditorTransform
  // Replace the selection with the given node, or delete it if `node`
  // is null. When `inheritMarks` is true and the node is an inline
  // node, it inherits the marks from the place where it is inserted.
  replaceSelection(node, inheritMarks) {
    let {$from, $to, from, to, node: selNode} = this.selection

    if (node && node.isInline && inheritMarks !== false)
      node = node.mark(this.storedMarks || this.doc.marksAt(from))
    let fragment = Fragment.from(node)

    if (selNode && selNode.isTextblock && node && node.isInline) {
      // Putting inline stuff onto a selected textblock puts it
      // inside, so cut off the sides
      from++
      to--
    } else if (selNode) {
      let depth = $from.depth
      // This node can not simply be removed/replaced. Remove its parent as well
      while (depth && $from.node(depth).childCount == 1 &&
             !$from.node(depth).canReplace($from.index(depth), $to.indexAfter(depth), fragment)) {
        depth--
      }
      if (depth < $from.depth) {
        from = $from.before(depth + 1)
        to = $from.after(depth + 1)
      }
    } else if (node && from == to) {
      let point = insertPoint(this.doc, from, node.type, node.attrs)
      if (point != null) from = to = point
    }

    this.replaceWith(from, to, fragment)
    let map = this.mapping.maps[this.mapping.maps.length - 1]
    this.setSelection(Selection.near(this.doc.resolve(map.map(to)), node && node.isInline ? -1 : 1))
    return this
  }

  // :: () → EditorTransform
  // Delete the selection.
  deleteSelection() {
    return this.replaceSelection()
  }

  // :: (string) → EditorTransform
  // Replace the selection with a text node containing the given string.
  insertText(text, from, to = from) {
    let useSel = from == null
    if (useSel) {
      ;({from, to} = this.selection)
    }

    let node = text ? this.doc.type.schema.text(text, this.storedMarks || this.doc.marksAt(from)) : null
    if (useSel)
      this.replaceSelection(node, false)
    else
      this.replaceWith(from, to, node)

    if (text) {
      let map = this.mapping.maps[this.mapping.maps.length - 1]
      this.setSelection(Selection.findFrom(this.doc.resolve(map.map(to)), -1))
    }
    return this
  }

  action(options) {
    let action = {type: "transform",
                  transform: this,
                  selection: this.selectionSet ? this.selection : null}
    if (options) for (let prop in options) action[prop] = options[prop]
    return action
  }

  scrollAction() {
    return this.action({scrollIntoView: true})
  }
}
exports.EditorTransform = EditorTransform
