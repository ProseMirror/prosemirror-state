const {buildStateClass} = require("./state")

class Config {
  constructor(plugins) {
    this.plugins = plugins
    this.stateClass = buildStateClass(this.plugins)
  }

  createState(config) {
    return this.stateClass.create(config)
  }

  extend(plugins) {
    return new Config(this.plugins.concat(plugins))
  }
}

exports.baseConfig = new Config([])
