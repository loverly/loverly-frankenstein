/*******************************************************************************
 *
 * Client.js
 *
 * Date:   April 2014
 * Author: Brandon Eum <brandon@lover.ly>
 *
 ******************************************************************************/

var AbstractSource = require('./AbstractSource');


/**
 * An extremely basic search client for Solr that conforms to frankenstein
 * requirements.
 *
 * @class class
 * @constructor
 * @extends parent
 */
var Client = function (connOptions, searchOptions, http, buffer) {
  this.name = 'SolrClient';

  this.http = http;
  this.agent = null;
  this.Buffer = buffer ? buffer.Buffer : null;

  this.defaults = {
    conn: {
      scheme: 'http',
      host: 'localhost',
      port: 8983,
      user: 'test',
      pass: 'loverly',
      max_sockets: 20
    },
    search: {
      core: 'default',   // Core to use in a multi-core environment
      handler: 'select', // Default solr search handler
      format: 'json',    // Default to JSON as the response format
      rows: 25,          // Default page size
      parser: 'lucene',   // Default parser to use 'defType' param
      facet_mincount: 1
    }
  };

  this.options = {conn: {}, search: {}};

  // Short circuit for empty constructor args
  if (!connOptions || !searchOptions) {
    return;
  }

  // Fill in the connection and search options
  var i;
  for (i in this.defaults.conn) {
    this.options.conn[i] = connOptions[i] || this.defaults.conn[i];
  }

  for (i in this.defaults.search) {
    this.options.search[i] = searchOptions[i] || this.defaults.search[i];
  }
};

Client.prototype = new AbstractSource();

/**
 * Create a new HTTP agent with a generous max pool size for outgoing requests.
 *
 * @method initialize
 */
Client.prototype.initialize = function () {
  this.agent = new this.http.Agent();
  this.agent.maxSockets = this.options.conn.max_sockets;
};

Client.prototype.parseQuery = function (params, queryParserType) {
  queryParserType = queryParserType || 'edismax';

  if (typeof this.parse[queryParserType] !== 'function') {
    throw new Error("The solr search client does not support the query type: " + queryParserType);
  }

  return this.parse[queryParserType](params);
};

Client.prototype.parse = {};

/**
 * Support querying using the eDisMax parser.  Each parameter can be required (+),
 * prohibited (-), or optional (empty string).  The value of the parameter is used
 * to determine what the field requirement is.  The value can also be a phrase, which
 * will be captured in double quotes.
 *
 * @method method
 */
Client.prototype.parse.edismax = function (params) {
  var query = '';
  var term;
  var requirement;

  for (var i in params) {
    if (i === 'null') {
      continue;
    }

    term = i;

    // Add double quotes around a key if it contains a space so it will be searched
    // as a phrase query
    if (term.indexOf(' ') !== -1) {
      term = '"' + term + '"';
    }

    requirement = params[i] || '';
    query += requirement + term + ' ';
  }

  query = encodeURIComponent(query);
  return query;
};


/**
 * Accept plain query strings for the lucene parser because the format is too
 * complicated to parse properly.
 *
 * @method parse.lucene
 */
Client.prototype.parse.lucene = function (params) {
  var query = '';
  var field;
  var value;

  for (var i in params) {
    if (i === 'null') {
      continue;
    }

    field = i;
    value = params[i] || '';

    // Always add double quotes around a value to mark it as a phrase
    if (typeof value === 'string' && value.indexOf(' ') !== -1 && !/\(|\)/.test(value)) {
      value =  '"' + value + '"';
    } else if (value instanceof Array) {
      value = '[' + value[0] + ' TO ' + value[1] + ']';
    }

    query += i + ':' + value + ' ';
  }

  query = query.trim();

  return encodeURIComponent(query);
};

/**
 * Generate the http options specifically for a solr query (vs import action)
 *
 * @method method
 */
Client.prototype.generateQueryHttpOptions = function (query, filterQuery, options) {
  var handler = options.handler || this.options.search.handler;
  var path = '/solr/' + this.options.search.core + '/' + handler + '?';
  var queryParams = [];

  // Add the main query
  queryParams.push('q=' + query);


  if (filterQuery) {
    queryParams.push('fq=' + filterQuery);
  }

  var limit = (options.limit !== null && typeof options.limit !== 'undefined') ? options.limit : this.options.search.rows;
  queryParams.push('start=' + (options.offset || 0));
  queryParams.push('wt=' + this.options.search.format);

  if (options.search_type === 'faceted') {
    queryParams.push('rows=0');
    queryParams.push('facet.limit=' + limit);

    var mincount = options.facet_mincount || this.options.search.facet_mincount;
    mincount = (typeof mincount !== 'undefined') ? mincount : 1;
    queryParams.push('facet.mincount=' + mincount)

    // Add the facet sort direction
    var sort = options.sort || this.options.search.facet_sort;
    if (sort && (sort === 'index' || sort === 'count')) {
      queryParams.push('facet.sort=' + sort);
    }
  } else {
    queryParams.push('rows=' + limit);
  }

  path += queryParams.join('&');

  var httpOptions = {
    host: this.options.conn.host,
    port: this.options.conn.port,
    path: path,
    agent: this.agent
  };

  // Add basic auth headers if it exists
  if (this.options.conn.user && this.options.conn.pass) {
    httpOptions.auth = this.options.conn.user + ':' + this.options.conn.pass;
  }

  return httpOptions;
};

/**
 * Generate the http options specifically for a solr import action
 *
 * @method generateCommandHttpOptions
 */
Client.prototype.generateCommandHttpOptions = function (core, command, clean, commit) {
  core = core || this.options.search.core;
  var path = '/solr/' + core + '/' + this.options.search.handler + '?';
  path += 'command=' + command;

  if (clean) {
    path += '&clean=true';
  }

  if (commit) {
    path += '&commit=true';
  }

  path += '&wt=' + this.options.search.format;

  var httpOptions = {
    host: this.options.conn.host,
    port: this.options.conn.port,
    path: path,
    agent: this.agent
  };

  // Add basic auth headers if it exists
  if (this.options.conn.user && this.options.conn.pass) {
    httpOptions.auth = this.options.conn.user + ':' + this.options.conn.pass;
  }

  return httpOptions;
};

/**
 * Call solr with the query with 0 rows so we can receive the count.
 *
 * @method count
 */
Client.prototype.count = function (params, options, callback) {
  var self = this;
  var query = this.parseQuery(params, this.options.search.parser);

  var optionsCopy = {};
  for (var i in options) {
    optionsCopy[i] = options[i];
  }

  // Set the rows to return to 0, we just want the total count
  optionsCopy.limit = 0;

  var filterQuery = this.parseQuery(params.fq, 'lucene');
  var httpOptions = this.generateQueryHttpOptions(query, filterQuery, optionsCopy);

  // Create a nice debugging output
  var debugOptions = {
    host: httpOptions.host,
    port: httpOptions.port,
    path: httpOptions.path
  };
  console.debug("Solr COUNT:", JSON.stringify(debugOptions));

  // Make the HTTP request
  var request = this.http.request(
    httpOptions,
    this.generateRequestCallback(function (err, data) {
      if (err) {
        callback(err);
      } else {
        self.formatData('count', data, callback);
      }
    })
  );

  request.on('error', function (err) {
    callback(err);
  });

  request.end();
};

/**
 * Call solr to get a list of ID's
 *
 * @method list
 */
Client.prototype.list = function (params, options, callback) {
  var self = this;
  var query = this.parseQuery(params.q, this.options.search.parser);

  var filterQuery = this.parseQuery(params.fq, 'lucene');
  var httpOptions = this.generateQueryHttpOptions(query, filterQuery, options);

  // Create a nice debugging output
  var debugOptions = {
    params: params,
    query: query,
    host: httpOptions.host,
    port: httpOptions.port,
    path: httpOptions.path
  };
  console.debug("Solr LIST:", JSON.stringify(debugOptions));

  // Make the HTTP request
  var request = this.http.request(
    httpOptions,
    this.generateRequestCallback(function (err, data) {
      if (err) {
        callback(err);
      } else {
        self.formatData('list', data, callback);
      }
    })
  );

  request.on('error', function (err) {
    callback(err);
  });

  request.end();
};

/**
 * Provide a way to call the data-import command on Solr.  Supports delta
 * queries as well as status queries.
 *
 * @method import
 */
Client.prototype.import = function (core, command, clean, commit, callback) {
  var self = this;
  var httpOptions = this.generateCommandHttpOptions(core, command, clean, commit);

  // Create a nice debugging output
  var debugOptions = {
    host: httpOptions.host,
    port: httpOptions.port,
    path: httpOptions.path
  };
  console.debug("Solr IMPORT:", JSON.stringify(debugOptions));

  // Make the HTTP request
  var request = this.http.request(
    httpOptions,
    this.generateRequestCallback(function (err, data) {
      if (err) {
        callback(err);
      } else {
        self.formatData('import', data, callback);
      }
    })
  );

  request.on('error', function (err) {
    callback(err);
  });

  request.end();
};

/**
 * Handle the response from the Solr server.
 *
 * @method generateRequestCallback
 */
Client.prototype.generateRequestCallback = function (callback) {
  var self = this;

  return function (response) {
    var isCallbackCalled = false;
    var data;

    response.on('data', function (chunk) {
      if (!data) {
        data = chunk;
      } else {
        data = self.Buffer.concat([data, chunk]);
      }
    });

    response.on('error', function (err) {
      if (!isCallbackCalled) {
        isCallbackCalled = true;
        callback(err);
      }
    });

    response.on('end', function () {
      if (isCallbackCalled) {
        return;
      }

      if (response.statusCode !== 200) {
        console.debug('Solr client error ', response.statusCode, data.toString());
        callback({msg: 'Response was not 200, got: ' + response.statusCode});
      } else {
        callback(null, data);
      }
    });
  };
};

/**
 * Take a raw buffer and transform it into the expected response format.
 *
 * @method formatData
 */
Client.prototype.formatData = function (resultType, buffer, callback) {
  var response;
  try {
    response = JSON.parse(buffer.toString());
  } catch (e) {
    console.debug('Error parsing response', buffer.toString());
    callback(e);
    return;
  }


  if (response.responseHeader.status !== 0) {
    callback(response);
    return;
  }

  if (resultType === 'list') {
    callback(null, response);
  } else if (resultType === 'count') {
    callback(null, response.response.numFound);
  } else {
    callback(null, response);
  }
};

module.exports = Client;
