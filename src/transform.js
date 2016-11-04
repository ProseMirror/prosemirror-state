const {Fragment, Slice, Node} = require("prosemirror-model")
const {Transform, insertPoint} = require("prosemirror-transform")
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

  // :: (?union<Node, Slice>, ?bool) → EditorTransform
  // Replace the selection with the given node or slice, or delete it
  // if `content` is null. When `inheritMarks` is true and the content
  // is inline, it inherits the marks from the place where it is
  // inserted.
  replaceSelection(content, inheritMarks) {
    let slice = content
    if (!content) slice = Slice.empty
    else if (content instanceof Node) slice = new Slice(Fragment.from(content), 0, 0)

    if (!slice.size) return this.deleteSelection()

    let {from, to, $from} = this.selection
    let flat = !(slice.openLeft || slice.openRight) && (slice.content.firstChild.isInline ? "inline" : "block")

    if (inheritMarks !== false && flat == "inline") {
      let marks = this.state.storedMarks || this.doc.marksAt(from, to > from), marked = []
      slice.content.forEach(node => marked.push(node.mark(marks)))
      slice = new Slice(Fragment.from(marked), slice.openLeft, slice.openRight)
    }

    let maybeDropEmpty = flat != "inline" && $from.parentOffset == 0 && to == $from.end()
    let insertIntoTextblock = $from.parent.isTextblock && !(maybeDropEmpty && !$from.parent.type.spec.defining)

    // If we're inserting into a non-textblock node (possibly because
    // the textblock around the selection wasn't flagged as defining)
    // and the slice has open nodes on the left, close those nodes
    // until a non-defining non-textblock node is found.
    if (!insertIntoTextblock && !flat) {
      let leaveOpen = slice.openLeft, openNodes = []
      for (let frag = slice.content, d = 0, next; d < slice.openLeft; d++) {
        openNodes.push(next = frag.firstChild)
        frag = next.content
      }
      for (; leaveOpen > 0; leaveOpen--) {
        let parent = openNodes[leaveOpen - 1]
        if (!(parent.isTextblock || parent.type.spec.defining)) break
      }
      if (leaveOpen < slice.openLeft)
        slice = new Slice(closeFragment(slice.content, 0, slice.openLeft, leaveOpen), leaveOpen, slice.openRight)
    }

    // If we're not inserting flat inline content, and the selection
    // spans a whole node, drop any parent nodes that are non-defining
    // or don't fit the content (except if we're inserting a block
    // that fits into that parent node).
    if (maybeDropEmpty) {
      let innerFragment = slice.content
      for (let i = 0; i < slice.openLeft; i++) innerFragment = innerFragment.firstChild.content

      for (let d = $from.depth; d > 0; d--) {
        let parent = $from.node(d)
        if (from != $from.start(d) || to != $from.end(d) ||
            ((flat != "block" || parent.type.spec.defining) &&
             parent.canReplace($from.index(d), $from.indexAfter(d), slice.content)))
          break
        from--
        to++
      }
    }

    // When inserting a single block into an empty selection, allow
    // the selection to move out of its parent when it is at the side,
    // if that brings us to a position where the node can be inserted.
    if (from == to && flat == "block" && slice.content.childCount == 1) {
      let point = insertPoint(this.doc, from, slice.content.firstChild.type, slice.content.firstChild.attrs)
      if (point != null) from = to = point
    }

    this.replace(from, to, slice)
    // For non-fully-inline replacements, manually move the selection
    // to the proper position.
    let map = this.mapping.maps[this.mapping.maps.length - 1]
    let lastNode = slice.content.lastChild
    for (let i = 0; i < slice.openRight; i++) lastNode = lastNode.lastChild
    this.setSelection(Selection.near(this.doc.resolve(map.map(to)), lastNode.isInline ? -1 : 1))
    return this
  }

  // :: () → EditorTransform
  // Delete the selection.
  deleteSelection() {
    let {from, to, $from} = this.selection
    // When this deletes the whole content of a node that can't be
    // empty, delete that parent node too, and so on for the next
    // parent.
    for (let d = $from.depth; d > 0; d--) {
      if (from != $from.start(d) || to != $from.end(d) ||
          $from.node(d).contentMatchAt(0).validEnd()) break
      from--
      to++
    }
    return this.delete(from, to)
  }

  // :: (string, from: ?number, to: ?number) → EditorTransform
  // Replace the given range, or the selection if no range is given,
  // with a text node containing the given string.
  insertText(text, from, to = from) {
    let useSel = from == null
    if (useSel) {
      ;({from, to} = this.selection)
    }

    let node = text ? this.state.schema.text(text, this.state.storedMarks || this.doc.marksAt(from, to > from)) : null
    if (useSel)
      this.replaceSelection(node, false)
    else
      this.replaceWith(from, to, node)

    if (text && useSel) {
      let map = this.mapping.maps[this.mapping.maps.length - 1]
      this.setSelection(Selection.findFrom(this.doc.resolve(map.map(to)), -1))
    }
    return this
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

function closeFragment(fragment, depth, oldOpen, newOpen, parent) {
  if (depth < oldOpen) {
    let first = fragment.firstChild
    fragment = fragment.replaceChild(0, first.copy(closeFragment(first.content, depth + 1, oldOpen, newOpen, first)))
  }
  if (depth > newOpen)
    fragment = parent.contentMatchAt(0).fillBefore(fragment).append(fragment)
  return fragment
}
