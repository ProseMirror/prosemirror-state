function copyObj(from, to) {
  for (let prop in from) to[prop] = from[prop]
  return to
}

class Plugin {
  // :: (Object)
  // Create a plugin. FIXME document options
  constructor(options, root) {
    this.props = options.props || {}
    this.config = options.config || {}
    this.options = options
    this.root = root || this
  }

  // :: (Object) → Plugin
  // Create a reconfigured instance of this plugin. Any config fields
  // not listed in the given object are inherited from the original
  // configuration.
  configure(config) {
    return new Plugin(copyObj({
      config: copyObj(config, copyObj(this.config, {}))
    }, copyObj(this.options, {})), this.root)
  }

  // :: (EditorState) → ?Plugin
  // Find the instance of this plugin in a given editor state, if it
  // exists.
  find(state) { return state._pluginSet.findPlugin(this) }
}
exports.Plugin = Plugin
