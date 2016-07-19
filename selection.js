// ;; An editor selection. Can be one of two selection types:
// `TextSelection` or `NodeSelection`. Both have the properties
// listed here, but also contain more information (such as the
// selected [node](#NodeSelection.node) or the
// [head](#TextSelection.head) and [anchor](#TextSelection.anchor)).
class Selection {
  // :: number
  // The left bound of the selection.
  get from() { return this.$from.pos }

  // :: number
  // The right bound of the selection.
  get to() { return this.$to.pos }

  constructor($from, $to) {
    // :: ResolvedPos
    // The resolved left bound of the selection
    this.$from = $from
    // :: ResolvedPos
    // The resolved right bound of the selection
    this.$to = $to
  }

  // :: bool
  // True if the selection is an empty text selection (head an anchor
  // are the same).
  get empty() {
    return this.from == this.to
  }

  // :: (other: Selection) → bool #path=Selection.prototype.eq
  // Test whether the selection is the same as another selection.

  // :: (doc: Node, mapping: Mappable) → Selection #path=Selection.prototype.map
  // Map this selection through a [mappable](#Mappable) thing. `doc`
  // should be the new document, to which we are mapping.

  // :: (ResolvedPos, number, ?bool) → ?Selection
  // Find a valid cursor or leaf node selection starting at the given
  // position and searching back if `dir` is negative, and forward if
  // negative. When `textOnly` is true, only consider cursor
  // selections.
  static findFrom($pos, dir, textOnly) {
    let inner = $pos.parent.isTextblock ? new TextSelection($pos)
        : findSelectionIn($pos.node(0), $pos.parent, $pos.pos, $pos.index(), dir, textOnly)
    if (inner) return inner

    for (let depth = $pos.depth - 1; depth >= 0; depth--) {
      let found = dir < 0
          ? findSelectionIn($pos.node(0), $pos.node(depth), $pos.before(depth + 1), $pos.index(depth), dir, textOnly)
          : findSelectionIn($pos.node(0), $pos.node(depth), $pos.after(depth + 1), $pos.index(depth) + 1, dir, textOnly)
      if (found) return found
    }
  }

  // :: (ResolvedPos, ?number, ?bool) → Selection
  // Find a valid cursor or leaf node selection near the given
  // position. Searches forward first by default, but if `bias` is
  // negative, it will search backwards first.
  static near($pos, bias = 1) {
    let result = this.findFrom($pos, bias) || this.findFrom($pos, -bias)
    if (!result) throw new RangeError("Searching for selection in invalid document " + $pos.node(0))
    return result
  }

  // :: (Node, ?bool) → ?Selection
  // Find the cursor or leaf node selection closest to the start of
  // the given document. When `textOnly` is true, only consider cursor
  // selections.
  static atStart(doc, textOnly) {
    return findSelectionIn(doc, doc, 0, 0, 1, textOnly)
  }

  // :: (Node, ?bool) → ?Selection
  // Find the cursor or leaf node selection closest to the end of
  // the given document. When `textOnly` is true, only consider cursor
  // selections.
  static atEnd(doc, textOnly) {
    return findSelectionIn(doc, doc, doc.content.size, doc.childCount, -1, textOnly)
  }

  // :: (ResolvedPos, ResolvedPos, ?number) → Selection
  static between($anchor, $head, bias) {
    let found = Selection.near($head, bias)
    if (found instanceof TextSelection) {
      let nearAnchor = Selection.findFrom($anchor, $anchor.pos > found.to ? -1 : 1, true)
      found = new TextSelection(nearAnchor.$anchor, found.$head)
    } else if ($anchor.pos < found.from || $anchor.pos > found.to) {
      // If head falls on a node, but anchor falls outside of it, create
      // a text selection between them
      let inv = $anchor.pos > found.to
      let foundAnchor = Selection.findFrom($anchor, inv ? -1 : 1, true)
      let foundHead = Selection.findFrom(inv ? found.$from : found.$to, inv ? 1 : -1, true)
      if (foundAnchor && foundHead)
        found = new TextSelection(foundAnchor.$anchor, foundHead.$head)
    }
    return found
  }
}
exports.Selection = Selection

// ;; A text selection represents a classical editor
// selection, with a head (the moving side) and anchor (immobile
// side), both of which point into textblock nodes. It can be empty (a
// regular cursor position).
class TextSelection extends Selection {
  // :: number
  // The selection's immobile side (does not move when pressing
  // shift-arrow).
  get anchor() { return this.$anchor.pos }
  // :: number
  // The selection's mobile side (the side that moves when pressing
  // shift-arrow).
  get head() { return this.$head.pos }

  // :: (ResolvedPos, ?ResolvedPos)
  // Construct a text selection. When `head` is not given, it defaults
  // to `anchor`.
  constructor($anchor, $head = $anchor) {
    let inv = $anchor.pos > $head.pos
    super(inv ? $head : $anchor, inv ? $anchor : $head)
    // :: ResolvedPos The resolved anchor of the selection.
    this.$anchor = $anchor
    // :: ResolvedPos The resolved head of the selection.
    this.$head = $head
  }

  get inverted() { return this.anchor > this.head }

  eq(other) {
    return other instanceof TextSelection && other.head == this.head && other.anchor == this.anchor
  }

  map(doc, mapping) {
    let $head = doc.resolve(mapping.map(this.head))
    if (!$head.parent.isTextblock) return Selection.near($head)
    let $anchor = doc.resolve(mapping.map(this.anchor))
    return new TextSelection($anchor.parent.isTextblock ? $anchor : $head, $head)
  }

  get token() {
    return new SelectionToken(TextSelection, this.anchor, this.head)
  }

  static mapToken(token, mapping) {
    return new SelectionToken(TextSelection, mapping.map(token.a), mapping.map(token.b))
  }

  static fromToken(token, doc) {
    let $head = doc.resolve(token.b)
    if (!$head.parent.isTextblock) return Selection.near($head)
    let $anchor = doc.resolve(token.a)
    return new TextSelection($anchor.parent.isTextblock ? $anchor : $head, $head)
  }
}
exports.TextSelection = TextSelection

// ;; A node selection is a selection that points at a
// single node. All nodes marked [selectable](#NodeType.selectable)
// can be the target of a node selection. In such an object, `from`
// and `to` point directly before and after the selected node.
class NodeSelection extends Selection {
  // :: (ResolvedPos)
  // Create a node selection. Does not verify the validity of its
  // argument. Use `ProseMirror.setNodeSelection` for an easier,
  // error-checking way to create a node selection.
  constructor($from) {
    let $to = $from.plusOne()
    super($from, $to)
    // :: Node The selected node.
    this.node = $from.nodeAfter
  }

  eq(other) {
    return other instanceof NodeSelection && this.from == other.from
  }

  map(doc, mapping) {
    let $from = doc.resolve(mapping.map(this.from, 1))
    let to = mapping.map(this.to, -1)
    let node = $from.nodeAfter
    if (node && to == $from.pos + node.nodeSize && node.type.selectable)
      return new NodeSelection($from)
    return Selection.near($from)
  }

  get token() {
    return new SelectionToken(NodeSelection, this.from, this.to)
  }

  static mapToken(token, mapping) {
    return new SelectionToken(NodeSelection, mapping.map(token.a, 1), mapping.map(token.b, -1))
  }

  static fromToken(token, doc) {
    let $from = doc.resolve(token.a), node = $from.nodeAfter
    if (node && token.b == token.a + node.nodeSize && node.type.selectable)
      return new NodeSelection($from)
    return Selection.near($from)
  }
}
exports.NodeSelection = NodeSelection

class SelectionToken {
  constructor(type, a, b) {
    this.type = type
    this.a = a
    this.b = b
  }
}

// FIXME we'll need some awareness of text direction when scanning for selections

// Try to find a selection inside the given node. `pos` points at the
// position where the search starts. When `text` is true, only return
// text selections.
function findSelectionIn(doc, node, pos, index, dir, text) {
  if (node.isTextblock) return new TextSelection(doc.resolve(pos))
  for (let i = index - (dir > 0 ? 0 : 1); dir > 0 ? i < node.childCount : i >= 0; i += dir) {
    let child = node.child(i)
    if (!child.type.isLeaf) {
      let inner = findSelectionIn(doc, child, pos + dir, dir < 0 ? child.childCount : 0, dir, text)
      if (inner) return inner
    } else if (!text && child.type.selectable) {
      return new NodeSelection(doc.resolve(pos - (dir < 0 ? child.nodeSize : 0)))
    }
    pos += child.nodeSize * dir
  }
}
