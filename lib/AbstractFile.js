/*******************************************************************************
 *
 * AbstractFile.js
 *
 * Date: November 2013
 * Author: Brandon Eum <brandon@lover.ly>
 *
 ******************************************************************************/

var AbstractFile = function (options) {
  var self = this;
  this.filename = this.filename || 'tmp.json';
  this.filepath = this.filepath || '/tmp.json';

  // The node.js fs library
  this.fs = null;

  // There could be an incremental cache_strategy where part of the file is loaded
  // into memory...
  this.options = {cache_strategy: 'all', parse_strategy: 'json'};

  options = options || {};
  for (var i in this.options) {
    this.options[i] = options[i] || this.options[i];
  }

  this.data = null;

  /**
   *
   * @param err
   * @param file
   */
  this.setDataFromFile = function (err, file) {
    if (err) {
      throw new Error(err);
    }

    if (self.options.parse_strategy === 'json') {
      self.data = JSON.parse(file);
    } else {
      self.data = file;
    }
  };
};

/**
 *
 * @param callback
 */
AbstractFile.prototype.initialize = function () {
  if (this.options.cache_strategy !== 'all') {
    callback();
    return;
  }

  this.data = this.fs.readFileSync(this.filepath, {encoding: 'UTF-8'});

  if (this.options.parse_strategy === 'json') {
    this.data = JSON.parse(this.data);
  }
};

/**
 * Read one document from the file.
 *
 * @param offset
 * @param callback
 */
AbstractFile.prototype.read = function (offset, callback) {
  callback(null, this.data[offset]);
};

/**
 * For now assume all reads come from memory rather than from a file.  Otherwise
 * we'll have to build a streaming JSON parser like a SAX XML parser...
 *
 * @param limit
 * @param offset
 * @param callback
 */
AbstractFile.prototype.readMany = function (limit, offset, callback) {
  var i, result = [];
  for (i = offset; i < offset + limit && i < this.data.length; i++) {
    result.push(this.data[i]);
  }

  callback(null, result);
};

module.exports = AbstractFile;