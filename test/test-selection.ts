import {TextSelection} from "prosemirror-state"

import {schema, eq, doc, blockquote, pre, p, li, ul, img, em, a, br, hr} from "prosemirror-test-builder"
import {TestState} from "./state.js"
import ist from "ist"

describe("Selection", () => {
  it("should follow changes", () => {
    let state = new TestState({doc: doc(p("hi")), schema})
    state.apply(state.tr.insertText("xy", 1))
    ist(state.selection.head, 3)
    ist(state.selection.anchor, 3)
    state.apply(state.tr.insertText("zq", 1))
    ist(state.selection.head, 5)
    ist(state.selection.anchor, 5)
    state.apply(state.tr.insertText("uv", 7))
    ist(state.selection.head, 5)
    ist(state.selection.anchor, 5)
  })

  it("should move after inserted content", () => {
    let state = new TestState({doc: doc(p("hi")), schema})
    state.textSel(2, 3)
    state.apply(state.tr.insertText("o"))
    ist(state.selection.head, 3)
    ist(state.selection.anchor, 3)
  })

  it("moves after an inserted leaf node", () => {
    let state = new TestState({doc: doc(p("foobar")), schema})
    state.textSel(4)
    state.apply(state.tr.replaceSelectionWith(schema.node("horizontal_rule")))
    ist(state.doc, doc(p("foo"), hr(), p("bar")), eq)
    ist(state.selection.head, 7)
    state.textSel(10)
    state.apply(state.tr.replaceSelectionWith(schema.node("horizontal_rule")))
    ist(state.doc, doc(p("foo"), hr(), p("bar"), hr()), eq)
    ist(state.selection.from, 11)
  })

  it("allows typing over a leaf node", () => {
    let state = new TestState({doc: doc(p("a"), "<a>", hr(), p("b")), schema})
    state.nodeSel(3)
    state.apply(state.tr.replaceSelectionWith(schema.text("x")))
    ist(state.doc, doc(p("a"), p("x"), p("b")), eq)
    ist(state.selection.head, 5)
    ist(state.selection.anchor, 5)
  })

  it("allows deleting a selected block", () => {
    let state = new TestState({doc: doc(p("foo"), ul(li(p("bar")), li(p("baz")), li(p("quux")))), schema})
    state.nodeSel(0)
    state.deleteSelection()
    ist(state.doc, doc(ul(li(p("bar")), li(p("baz")), li(p("quux")))), eq)
    ist(state.selection.head, 3)
    state.nodeSel(2)
    state.deleteSelection()
    ist(state.doc, doc(ul(li(p("baz")), li(p("quux")))), eq)
    ist(state.selection.head, 3)
    state.nodeSel(9)
    state.deleteSelection()
    ist(state.doc, doc(ul(li(p("baz")))), eq)
    ist(state.selection.head, 6)
    state.nodeSel(0)
    state.deleteSelection()
    ist(state.doc, doc(p()), eq)
  })

  it("preserves the marks of a deleted selection", () => {
    let state = new TestState({doc: doc(p("foo", em("<a>bar<b>"), "baz"))})
    state.deleteSelection()
    ist(state.state.storedMarks!.length, 1)
  })

  it("doesn't preserve non-inclusive marks of a deleted selection", () => {
    let state = new TestState({doc: doc(p("foo", a(em("<a>bar<b>")), "baz"))})
    state.deleteSelection()
    ist(state.state.storedMarks!.length, 1)
  })

  it("doesn't preserve marks when deleting a selection at the end of a block", () => {
    let state = new TestState({doc: doc(p("foo", em("bar<a>")), p("b<b>az"))})
    state.deleteSelection()
    ist(!state.state.storedMarks)
  })

  it("drops non-inclusive marks at the end of a deleted span when appropriate", () => {
    let state = new TestState({doc: doc(p("foo", a("ba", em("<a>r<b>")), "baz"))})
    state.deleteSelection()
    ist(state.state.storedMarks!.map(x => x.type.name).join(), "em")
  })

  it("keeps non-inclusive marks when still inside them", () => {
    let state = new TestState({doc: doc(p("foo", a("b", em("<a>a<b>"), "r"), "baz"))})
    state.deleteSelection()
    ist(state.state.storedMarks!.length, 2)
  })

  it("preserves marks when typing over marked text", () => {
    let state = new TestState({doc: doc(p("foo ", em("<a>bar<b>"), " baz"))})
    state.apply(state.tr.insertText("quux"))
    ist(state.doc, doc(p("foo ", em("quux"), " baz")), eq)
    state.apply(state.tr.insertText("bar", 5, 9))
    ist(state.doc, doc(p("foo ", em("bar"), " baz")), eq)
  })

  it("allows deleting a leaf", () => {
    let state = new TestState({doc: doc(p("a"), hr(), hr(), p("b")), schema})
    state.nodeSel(3)
    state.deleteSelection()
    ist(state.doc, doc(p("a"), hr(), p("b")), eq)
    ist(state.selection.from, 3)
    state.deleteSelection()
    ist(state.doc, doc(p("a"), p("b")), eq)
    ist(state.selection.head, 4)
  })

  it("properly handles deleting the selection", () => {
    let state = new TestState({doc: doc(p("foo", img(), "bar"), blockquote(p("hi")), p("ay")), schema})
    state.nodeSel(4)
    state.apply(state.tr.deleteSelection())
    ist(state.doc, doc(p("foobar"), blockquote(p("hi")), p("ay")), eq)
    ist(state.selection.head, 4)
    state.nodeSel(9)
    state.apply(state.tr.deleteSelection())
    ist(state.doc, doc(p("foobar"), p("ay")), eq)
    ist(state.selection.from, 9)
    state.nodeSel(8)
    state.apply(state.tr.deleteSelection())
    ist(state.doc, doc(p("foobar")), eq)
    ist(state.selection.from, 7)
  })

  it("can replace inline selections", () => {
    let state = new TestState({doc: doc(p("foo", img(), "bar", img(), "baz")), schema})
    state.nodeSel(4)
    state.apply(state.tr.replaceSelectionWith(schema.node("hard_break")))
    ist(state.doc, doc(p("foo", br(), "bar", img(), "baz")), eq)
    ist(state.selection.head, 5)
    ist(state.selection.empty)
    state.nodeSel(8)
    state.apply(state.tr.insertText("abc"))
    ist(state.doc, doc(p("foo", br(), "barabcbaz")), eq)
    ist(state.selection.head, 11)
    ist(state.selection.empty)
    state.nodeSel(0)
    state.apply(state.tr.insertText("xyz"))
    ist(state.doc, doc(p("xyz")), eq)
  })

  it("can replace a block selection", () => {
    let state = new TestState({doc: doc(p("abc"), hr(), hr(), blockquote(p("ow"))), schema})
    state.nodeSel(5)
    state.apply(state.tr.replaceSelectionWith(schema.node("code_block")))
    ist(state.doc, doc(p("abc"), pre(), hr(), blockquote(p("ow"))), eq)
    ist(state.selection.from, 7)
    state.nodeSel(8)
    state.apply(state.tr.replaceSelectionWith(schema.node("paragraph")))
    ist(state.doc, doc(p("abc"), pre(), hr(), p()), eq)
    ist(state.selection.from, 9)
  })

  it("puts the cursor after the inserted text when inserting a list item", () => {
    let state = new TestState({doc: doc(p("<a>abc"))})
    let source = doc(ul(li(p("<a>def<b>"))))
    state.apply(state.tr.replaceSelection(source.slice((source as any).tag.a, (source as any).tag.b, true)))
    ist(state.selection.from, 6)
  })
})

describe("TextSelection.between", () => {
  it("uses arguments when possible", () => {
    let d = doc(p("f<a>o<b>o"))
    let s = TextSelection.between(d.resolve((d as any).tag.b), d.resolve((d as any).tag.a))
    ist(s.anchor, (d as any).tag.b)
    ist(s.head, (d as any).tag.a)
  })

  it("will adjust when necessary", () => {
    let d = doc("<a>", p("foo"))
    let s = TextSelection.between(d.resolve((d as any).tag.a), d.resolve((d as any).tag.a))
    ist(s.anchor, 1)
  })

  it("uses bias when adjusting", () => {
    let d = doc(p("foo"), "<a>", p("bar")), pos = d.resolve((d as any).tag.a)
    let sUp = TextSelection.between(pos, pos, -1)
    ist(sUp.anchor, 4)
    let sDown = TextSelection.between(pos, pos, 1)
    ist(sDown.anchor, 6)
  })

  it("will fall back to a node selection", () => {
    let d = doc(hr, "<a>")
    let s = TextSelection.between(d.resolve((d as any).tag.a), d.resolve((d as any).tag.a))
    ist((s as any).node, d.firstChild)
  })

  it("will collapse towards the other argument", () => {
    let d = doc("<a>", p("foo"), "<b>")
    let s = TextSelection.between(d.resolve((d as any).tag.a), d.resolve((d as any).tag.b))
    ist(s.anchor, 1)
    ist(s.head, 4)
    s = TextSelection.between(d.resolve((d as any).tag.b), d.resolve((d as any).tag.a))
    ist(s.anchor, 4)
    ist(s.head, 1)
  })
})
