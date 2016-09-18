const {EditorState, TextSelection, Plugin} = require("../dist")
const {schema, eq, doc, p} = require("prosemirror-model/test/build")
const ist = require("ist")

const messageCountPlugin = new Plugin({
  stateFields: {
    messageCount: {
      init() { return 0 },
      applyAction(state) { return state.messageCount + 1 },
      toJSON(count) { return count },
      fromJSON(_, count) { return count }
    }
  }
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
    ist(state.messageCount, 0)
    ist(newState.messageCount, 2)
  })

  it("can be serialized to JSON", () => {
    let state = EditorState.create({plugins: [messageCountPlugin], doc: doc(p("ok"))})
    state = state.applyAction(new TextSelection(state.doc.resolve(3)).action())
    ist(JSON.stringify(state.toJSON()),
                 JSON.stringify({doc: {type: "doc", content: [{type: "paragraph", content: [
                   {type: "text", text: "ok"}]}]},
                                 selection: {head: 3, anchor: 3},
                                 messageCount: 1}))
    let copy = EditorState.fromJSON({plugins: [messageCountPlugin], schema}, state.toJSON())
    ist(copy.doc, state.doc, eq)
    ist(copy.selection.from, 3)

    let limitedJSON = state.toJSON({ignore: ["messageCount"]})
    ist(limitedJSON.doc)
    ist(limitedJSON.messageCount, undefined)
    ist(EditorState.fromJSON({plugins: [messageCountPlugin], schema}, limitedJSON).messageCount, 0)
  })

  it("supports reconfiguration", () => {
    let state = EditorState.create({plugins: [messageCountPlugin], schema})
    ist(state.messageCount, 0)
    let without = state.reconfigure({})
    ist(without.messageCount, undefined)
    ist(without.plugins.length, 0)
    ist(without.doc, doc(p()), eq)
    let reAdd = without.reconfigure({plugins: [messageCountPlugin]})
    ist(reAdd.messageCount, 0)
    ist(reAdd.plugins.length, 1)
  })
})
