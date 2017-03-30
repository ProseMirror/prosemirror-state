const {Slice, Fragment} = require("prosemirror-model")

let warnedAboutBetween = false

const classesById = Object.create(null)

// ::- Superclass for editor selections.
class Selection {
  // :: (ResolvedPos, ResolvedPos, ?[SelectionRange])
  // Initialize a selection with the head and anchor and ranges. If no
  // ranges are given, constructs a single range across `$anchor` and
  // `$head`.
  constructor($anchor, $head, ranges) {
    // :: [SelectionRange]
    // The ranges covered by the selection.
    this.ranges = ranges || [new SelectionRange($anchor.min($head), $anchor.max($head))]
    // :: ResolvedPos
    // The resolved anchor of the selection (the side that stays in
    // place when the selection is modified).
    this.$anchor = $anchor
    // :: ResolvedPos
    // The resolved head of the selection (the side that moves when
    // the selection is modified).
    this.$head = $head
  }

  // :: number
  // The selection's immobile side (does not move when
  // shift-selecting).
  get anchor() { return this.$anchor.pos }

  // :: number
  // The selection's mobile side (the side that moves when
  // shift-selecting).
  get head() { return this.$head.pos }

  // :: number
  // The lower bound of the selection's first range.
  get from() { return this.$from.pos }

  // :: number
  // The upper bound of the selection's first range.
  get to() { return this.$to.pos }

  // :: ResolvedPos
  // The resolved lower  bound of the selection's main range.
  get $from() {
    return this.ranges[0].$from
  }

  // :: ResolvedPos
  // The resolved upper bound of the selection's main range.
  get $to() {
    return this.ranges[0].$to
  }

  // :: bool
  // Indicates whether the selection contains any content.
  get empty() {
    let ranges = this.ranges
    for (let i = 0; i < ranges.length; i++)
      if (ranges[i].$from.pos != ranges[i].$to.pos) return false
    return true
  }

  // eq:: (Selection) → bool
  // Test whether the selection is the same as another selection. The
  // default implementation tests whether they have the same class,
  // head, and anchor.

  // map:: (doc: Node, mapping: Mappable) → Selection
  // Map this selection through a [mappable](#transform.Mappable) thing. `doc`
  // should be the new document, to which we are mapping.

  // :: Slice
  // Get the content of this selection as a slice.
  content() {
    return this.$from.node(0).slice(this.from, this.to, true)
  }

  // :: (Transaction, ?Slice)
  // Replace the selection with a slice or, if no slice is given,
  // delete the selection. Will append to the given transaction.
  replace(tr, content = Slice.empty) {
    // Put the new selection at the position after the inserted
    // content. When that ended in an inline node, search backwards,
    // to get the position after that node. If not, search forward.
    let lastNode = content.content.lastChild, lastParent = null
    for (let i = 0; i < content.openRight; i++) {
      lastParent = lastNode
      lastNode = lastNode.lastChild
    }

    let mapFrom = tr.steps.length, ranges = this.ranges
    for (let i = 0; i < ranges.length; i++) {
      let {$from, $to} = ranges[i], mapping = tr.mapping.slice(mapFrom)
      tr.replaceRange(mapping.map($from.pos), mapping.map($to.pos), i ? Slice.empty : content)
      if (i == 0)
        selectionToInsertionEnd(tr, mapFrom, (lastNode ? lastNode.isInline : lastParent && lastParent.isTextblock) ? -1 : 1)
    }
  }

  // :: (Transaction, Node)
  // Replace the selection with the given node, appending the changes
  // to the given transaction.
  replaceWith(tr, node) {
    let mapFrom = tr.steps.length, ranges = this.ranges
    for (let i = 0; i < ranges.length; i++) {
      let {$from, $to} = ranges[i], mapping = tr.mapping.slice(mapFrom)
      let from = mapping.map($from.pos), to = mapping.map($to.pos)
      if (i) {
        tr.deleteRange(from, to)
      } else {
        tr.replaceRangeWith(from, to, node)
        selectionToInsertionEnd(tr, mapFrom, node.isInline ? -1 : 1)
      }
    }
  }

  // toJSON:: () → Object
  // Convert the selection to a JSON representation. When implementing
  // this for a custom selection class, make sure to give the object a
  // `type` property whose value matches the ID under which you
  // [registered](#state.Selection^jsonID) your class. The default
  // implementation adds `type`, `head`, and `anchor` properties.

  // :: (ResolvedPos, number, ?bool) → ?Selection
  // Find a valid cursor or leaf node selection starting at the given
  // position and searching back if `dir` is negative, and forward if
  // negative. When `textOnly` is true, only consider cursor
  // selections.
  static findFrom($pos, dir, textOnly) {
    let inner = $pos.parent.inlineContent ? new TextSelection($pos)
        : findSelectionIn($pos.node(0), $pos.parent, $pos.pos, $pos.index(), dir, textOnly)
    if (inner) return inner

    for (let depth = $pos.depth - 1; depth >= 0; depth--) {
      let found = dir < 0
          ? findSelectionIn($pos.node(0), $pos.node(depth), $pos.before(depth + 1), $pos.index(depth), dir, textOnly)
          : findSelectionIn($pos.node(0), $pos.node(depth), $pos.after(depth + 1), $pos.index(depth) + 1, dir, textOnly)
      if (found) return found
    }
  }

  // :: (ResolvedPos, ?number) → Selection
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

  static between($anchor, $head, bias) {
    if (!warnedAboutBetween && typeof console != "undefined" && console.warn) {
      warnedAboutBetween = true
      console.warn("Selection.between is now called TextSelection.between")
    }
    return TextSelection.between($anchor, $head, bias)
  }

  // : (Object, Mapping) → Object
  // Map a JSON object representing this selection through a mapping.
  static mapJSON(json, mapping) {
    let result = {}
    for (let prop in json) {
      let value = json[prop]
      if (prop == "anchor" || prop == "head")
        value = mapping.map(value, json.type == "node" && prop == "head" ? -1 : 1)
      result[prop] = value
    }
    return result
  }

  // :: (Node, Object) → Selection
  // Deserialize a JSON representation of a selection. Must be
  // implemented for custom classes (as a static class method).
  static fromJSON(doc, json) {
    let cls = classesById[json.type]
    if (!cls) return this.backwardsCompatFromJSON(doc, json)
    return cls.fromJSON(doc, json)
  }

  static backwardsCompatFromJSON(doc, json) {
    if (json.anchor != null) return TextSelection.fromJSON(doc, json)
    if (json.node != null) return NodeSelection.fromJSON(doc, {anchor: json.node, head: json.after})
    throw new RangeError("Unrecognized JSON data " + JSON.stringify(json))
  }

  // :: (string, constructor<Selection>)
  // To be able to deserialize selections from JSON, custom selection
  // classes must register themselves with an ID string, so that they
  // can be disambiguated. Try to pick something that's unlikely to
  // clash with classes from other modules.
  static jsonID(id, selectionClass) {
    if (id in classesById) throw new RangeError("Duplicate use of selection JSON ID " + id)
    classesById[id] = selectionClass
    selectionClass.prototype.jsonID = id
    return selectionClass
  }
}
exports.Selection = Selection

// :: bool
// Controls whether, when a selection of this type is active in the
// browser, the selected range should be visible to the user. Defaults
// to `true`.
Selection.prototype.visible = true

// ::- Represents a selected range in a document.
class SelectionRange {
  // :: (ResolvedPos, ResolvedPos)
  constructor($from, $to) {
    // :: ResolvedPos
    // The lower bound of the range.
    this.$from = $from
    // :: ResolvedPos
    // The upper bound of the range.
    this.$to = $to
  }
}
exports.SelectionRange = SelectionRange

// ::- A text selection represents a classical editor
// selection, with a head (the moving side) and anchor (immobile
// side), both of which point into textblock nodes. It can be empty (a
// regular cursor position).
class TextSelection extends Selection {
  // :: (ResolvedPos, ?ResolvedPos)
  // Construct a text selection between the given points.
  constructor($anchor, $head = $anchor) {
    super($anchor, $head)
  }

  // :: ?ResolvedPos
  // Returns a resolved position if this is a cursor selection (an
  // empty text selection), and null otherwise.
  get $cursor() { return this.$anchor.pos == this.$head.pos ? this.$head : null }

  map(doc, mapping) {
    let $head = doc.resolve(mapping.map(this.head))
    if (!$head.parent.inlineContent) return Selection.near($head)
    let $anchor = doc.resolve(mapping.map(this.anchor))
    return new TextSelection($anchor.parent.inlineContent ? $anchor : $head, $head)
  }

  replace(tr, content = Slice.empty) {
    super.replace(tr, content)
    if (content == Slice.empty) {
      if (this.$from.parentOffset < this.$from.parent.content.size)
        tr.ensureMarks(this.$from.marks(true))
    }
  }

  eq(other) {
    return other instanceof TextSelection && other.anchor == this.anchor && other.head == this.head
  }

  toJSON() {
    return {type: "text", anchor: this.anchor, head: this.head}
  }

  // :: (Node, number, ?number) → TextSelection
  // Create a text selection from non-resolved positions.
  static create(doc, anchor, head = anchor) {
    let $anchor = doc.resolve(anchor)
    return new this($anchor, head == anchor ? $anchor : doc.resolve(head))
  }

  // :: (ResolvedPos, ResolvedPos, ?number) → Selection
  // Return a text selection that spans the given positions or, if
  // they aren't text positions, find a text selection near them.
  // `bias` determines whether the method searches forward (default)
  // or backwards (negative number) first. Will fall back to returning
  // a node selection when the document doesn't contain a valid text
  // position.
  static between($anchor, $head, bias) {
    let dPos = $anchor.pos - $head.pos
    if (!bias || dPos) bias = dPos >= 0 ? 1 : -1
    if (!$head.parent.inlineContent) {
      let found = Selection.findFrom($head, bias, true) || Selection.findFrom($head, -bias, true)
      if (found) $head = found.$head
      else return Selection.near($head, bias)
    }
    if (!$anchor.parent.inlineContent) {
      if (dPos == 0) {
        $anchor = $head
      } else {
        $anchor = (Selection.findFrom($anchor, -bias, true) || Selection.findFrom($anchor, bias, true)).$anchor
        if (($anchor.pos < $head.pos) != (dPos < 0)) $anchor = $head
      }
    }
    return new TextSelection($anchor, $head)
  }

  static fromJSON(doc, json) {
    // This is cautious, because the history will blindly map
    // selections and then try to deserialize them, and the endpoints
    // might not point at appropriate positions anymore (though they
    // are guaranteed to be inside of the document's range).
    return TextSelection.between(doc.resolve(json.anchor), doc.resolve(json.head))
  }
}
exports.TextSelection = TextSelection

Selection.jsonID("text", TextSelection)

// ::- A node selection is a selection that points at a
// single node. All nodes marked [selectable](#model.NodeSpec.selectable)
// can be the target of a node selection. In such an object, `from`
// and `to` point directly before and after the selected node.
class NodeSelection extends Selection {
  // :: (ResolvedPos)
  // Create a node selection. Does not verify the validity of its
  // argument.
  constructor($pos) {
    let node = $pos.nodeAfter
    let $end = $pos.node(0).resolve($pos.pos + node.nodeSize)
    super($pos, $end)
    // :: Node The selected node.
    this.node = node
  }

  map(doc, mapping) {
    let {deleted, pos} = mapping.mapResult(this.anchor, 1)
    let $pos = doc.resolve(pos)
    if (deleted) return Selection.near($pos)
    return new NodeSelection($pos)
  }

  content() {
    return new Slice(Fragment.from(this.node), 0, 0)
  }

  toJSON() {
    return {type: "node", anchor: this.anchor}
  }

  eq(other) {
    return other instanceof NodeSelection && other.anchor == this.anchor
  }

  // :: (Node, number, ?number) → TextSelection
  // Create a node selection from non-resolved positions.
  static create(doc, from) {
    return new this(doc.resolve(from))
  }

  // :: (Node) → bool
  // Determines whether the given node may be selected as a node
  // selection.
  static isSelectable(node) {
    return !node.isText && node.type.spec.selectable !== false
  }

  static fromJSON(doc, json) {
    let $pos = doc.resolve(json.anchor), node = $pos.nodeAfter
    if (node && NodeSelection.isSelectable(node)) return new NodeSelection($pos)
    return Selection.near($pos)
  }
}
exports.NodeSelection = NodeSelection

NodeSelection.prototype.visible = false

Selection.jsonID("node", NodeSelection)

// FIXME we'll need some awareness of text direction when scanning for selections

// Try to find a selection inside the given node. `pos` points at the
// position where the search starts. When `text` is true, only return
// text selections.
function findSelectionIn(doc, node, pos, index, dir, text) {
  if (node.inlineContent) return TextSelection.create(doc, pos)
  for (let i = index - (dir > 0 ? 0 : 1); dir > 0 ? i < node.childCount : i >= 0; i += dir) {
    let child = node.child(i)
    if (!child.isAtom) {
      let inner = findSelectionIn(doc, child, pos + dir, dir < 0 ? child.childCount : 0, dir, text)
      if (inner) return inner
    } else if (!text && NodeSelection.isSelectable(child)) {
      return NodeSelection.create(doc, pos - (dir < 0 ? child.nodeSize : 0))
    }
    pos += child.nodeSize * dir
  }
}

function selectionToInsertionEnd(tr, startLen, bias) {
  if (tr.steps.length == startLen) return
  let map = tr.mapping.maps[tr.mapping.maps.length - 1], end
  map.forEach((_from, _to, _newFrom, newTo) => end = newTo)
  if (end != null) tr.setSelection(Selection.near(tr.doc.resolve(end), bias))
}
