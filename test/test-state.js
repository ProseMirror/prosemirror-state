const {EditorState, TextSelection, Plugin} = require("../dist")
const {schema, eq, doc, p} = require("prosemirror-model/test/build")
const ist = require("ist")

const messageCountPlugin = new Plugin({
  state: {
    init() { return 0 },
    applyAction(_, count) { return count + 1 },
    toJSON(count) { return count },
    fromJSON(_, count) { return count }
  },
  name: "messageCount"
})

describe("State", () => {
  it("creates a default doc", () => {
    let state = EditorState.create({schema})
    ist(state.doc, doc(p()), eq)
  })

  it("creates a default selection", () => {
    let state = EditorState.create({doc: doc(p("foo"))})
    ist(state.selection.from, 1)
    ist(state.selection.to, 1)
  })

  it("applies transform actions", () => {
    let state = EditorState.create({schema})
    let newState = state.applyAction(state.tr.insertText("hi").action())
    ist(state.doc, doc(p()), eq)
    ist(newState.doc, doc(p("hi")), eq)
    ist(newState.selection.from, 3)
  })

  it("supports plugin fields", () => {
    let state = EditorState.create({plugins: [messageCountPlugin], schema})
    let newState = state.applyAction({type: "foo"}).applyAction({type: "bar"})
    ist(messageCountPlugin.getState(state), 0)
    ist(messageCountPlugin.getState(newState), 2)
  })

  it("can be serialized to JSON", () => {
    let state = EditorState.create({plugins: [messageCountPlugin], doc: doc(p("ok"))})
    state = state.applyAction(new TextSelection(state.doc.resolve(3)).action())
    ist(JSON.stringify(state.toJSON()),
                 JSON.stringify({doc: {type: "doc", content: [{type: "paragraph", content: [
                   {type: "text", text: "ok"}]}]},
                                 selection: {head: 3, anchor: 3},
                                 messageCount$: 1}))
    let copy = EditorState.fromJSON({plugins: [messageCountPlugin], schema}, state.toJSON())
    ist(copy.doc, state.doc, eq)
    ist(copy.selection.from, 3)

    let limitedJSON = state.toJSON({ignore: [messageCountPlugin]})
    ist(limitedJSON.doc)
    ist(limitedJSON.messageCount$, undefined)
    let deserialized = EditorState.fromJSON({plugins: [messageCountPlugin], schema}, limitedJSON)
    ist(messageCountPlugin.getState(deserialized), 0)
  })

  it("supports reconfiguration", () => {
    let state = EditorState.create({plugins: [messageCountPlugin], schema})
    ist(messageCountPlugin.getState(state), 0)
    let without = state.reconfigure({})
    ist(messageCountPlugin.getState(without), undefined)
    ist(without.plugins.length, 0)
    ist(without.doc, doc(p()), eq)
    let reAdd = without.reconfigure({plugins: [messageCountPlugin]})
    ist(messageCountPlugin.getState(reAdd), 0)
    ist(reAdd.plugins.length, 1)
  })
})
