let warnedAboutBetween = false

const classesById = Object.create(null)

// ::- Superclass for editor selections.
class Selection {
  constructor($anchor, $head = $anchor) {
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

  // :: ResolvedPos
  // The resolved lower bound of the selection.
  get $from() {
    return this.$head.pos < this.$anchor.pos ? this.$head : this.$anchor
  }

  // :: ResolvedPos
  // The resolved upper bound of the selection.
  get $to() {
    return this.$head.pos < this.$anchor.pos ? this.$anchor : this.$head
  }

  // :: number
  // The lower bound of the selection.
  get from() { return this.$from.pos }

  // :: number
  // The upper bound of the selection.
  get to() { return this.$to.pos }

  // :: bool
  // True if the selection is empty (head and anchor are the same).
  get empty() {
    return this.head == this.anchor
  }

  // eq:: (Selection) → bool
  // Test whether the selection is the same as another selection. The
  // default implementation tests whether they have the same class,
  // head, and anchor.
  eq(other) {
    return other instanceof this.constructor && other.anchor == this.anchor && other.head == this.head
  }

  // map:: (doc: Node, mapping: Mappable) → Selection
  // Map this selection through a [mappable](#transform.Mappable) thing. `doc`
  // should be the new document, to which we are mapping.

  // toJSON:: () → Object
  // Convert the selection to a JSON representation. When implementing
  // this for a custom selection class, make sure to give the object a
  // `type` property whose value matches the ID under which you
  // [registered](#state.Selection^jsonID) your class. The default
  // implementation adds `type`, `head`, and `anchor` properties.
  toJSON() {
    return {type: this.jsonID, anchor: this.anchor, head: this.head}
  }

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

  // :: (ResolvedPos, ?number, ?bool) → Selection
  // Find a valid cursor or leaf node selection near the given
  // position. Searches forward first by default, but if `bias` is
  // negative, it will search backwards first.
  static near($pos, bias = 1, textOnly = false) {
    let result = this.findFrom($pos, bias, textOnly) || this.findFrom($pos, -bias, textOnly)
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

// ::- A text selection represents a classical editor
// selection, with a head (the moving side) and anchor (immobile
// side), both of which point into textblock nodes. It can be empty (a
// regular cursor position).
class TextSelection extends Selection {
  // :: ?ResolvedPos
  // Returns a resolved position if this is a cursor selection (an
  // empty text selection), and null otherwise.
  get $cursor() { return this.empty ? this.$head : null }

  map(doc, mapping) {
    let $head = doc.resolve(mapping.map(this.head))
    if (!$head.parent.inlineContent) return Selection.near($head)
    let $anchor = doc.resolve(mapping.map(this.anchor))
    return new TextSelection($anchor.parent.inlineContent ? $anchor : $head, $head)
  }

  // :: (Node, number, ?number) → TextSelection
  // Create a text selection from non-resolved positions.
  static create(doc, anchor, head = anchor) {
    let $anchor = doc.resolve(anchor)
    return new this($anchor, head == anchor ? $anchor : doc.resolve(head))
  }

  // :: (ResolvedPos, ResolvedPos, ?number) → TextSelection
  // Return a text selection that spans the given positions or, if
  // they aren't text positions, find a text selection near them.
  // `bias` determines whether the method searches forward (default)
  // or backwards (negative number) first.
  static between($anchor, $head, bias) {
    let dir = $anchor.pos > $head.pos ? -1 : 1
    if (!$head.parent.inlineContent)
      $head = Selection.near($head, bias || -dir, true).$head
    if (!$anchor.parent.inlineContent) {
      $anchor = Selection.near($anchor, dir, true).$anchor
      if (($anchor.pos > $head.pos) != (dir < 0)) $anchor = $head
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
  constructor($from) {
    let $to = $from.node(0).resolve($from.pos + $from.nodeAfter.nodeSize)
    super($from, $to)
    // :: Node The selected node.
    this.node = $from.nodeAfter
  }

  map(doc, mapping) {
    let from = mapping.mapResult(this.anchor, 1), to = mapping.mapResult(this.head, -1)
    let $from = doc.resolve(from.pos), node = $from.nodeAfter
    if (!from.deleted && !to.deleted && node && to.pos == from.pos + node.nodeSize && NodeSelection.isSelectable(node))
      return new NodeSelection($from)
    return Selection.near($from)
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
    let $from = doc.resolve(json.anchor), node = $from.nodeAfter
    if (node && json.head == json.anchor + node.nodeSize && NodeSelection.isSelectable(node)) return new NodeSelection($from)
    else return Selection.near($from)
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
