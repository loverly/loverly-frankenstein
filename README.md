# Disclaimer

This is a *WORK IN PROGRESS* I would not recommend using this unless you really
want to waste a lot of time.




# loverly-frankenstein


The Loverly node.js model layer that allows a unified hierarchical structure on
top of an assortment of data-storage engines.

Tired of that restrictive flat relational structure?  Want a nice JSON-based
document on top of a legacy MySQL data store? No problem! __loverly-frankenstein__
is here to save the day!

The goal of this module is to abstract the underlying data storage engines from
the end-user's interactions, creating a clean easy-to-use presentation layer that
can fit into a standardized REST API.


## Is there a difference between an ORM and loverly-frankenstein?

Conceptually, not really.  At its core, the goal is the same, take data from a data
storage system and transform it into an object that is relevant to the application.
loverly-frankenstein allows you to specify in a very fine-grained fashion how
various pieces of data should be sewn together to form a cohesive system entity.


# Contents

* [Usage](#usage)
* [Model concepts](#model-concepts)
* [Creating a model](#creating-a-model)
* [Creating your own data sources](#creating-your-own-data-sources)

# Usage

Install in typical fashion:

    npm install loverly-frankenstein --save-dev

## Setting up loverly-frankenstein

The configuration and management of models can become quite complex if managed
manually.  I prefer to use a [Service Container](https://github.com/linkshare/service-container)
to manage building the objects I need, but you can do it manually if you prefer.


# Model concepts

From an application perspective, all interaction with your various data sources
should occur through Instances of a loverly-frankenstein __model__.  If you've
used an ORM like [Sequelize.js](http://sequelizejs.com/) or an ODM like [Mongoose](http://mongoosejs.com/)
then you're probably familiar with the concept.  A model represents an entity in
your system.  This could be a User, a Product, a Car, or anything that is relevant
to you and your application.  Sometimes the data for a specific entity is spread
across multiple data sources and is fairly hard to deal with consistently and easily.

Take for example, a User.  A User may have typical things like a username and a password,
but in a more complicated/broadly integrated system, they probably have Facebook
friends, Twitter followers, Instagram photos, analytics information, etc.  Wouldn't
it be nice to have all of these disparate pieces of information be gathered together
in a single object.

```javascript
// My user object
{
  name: "brandon",
  username: "brandon@lover.ly",
  password: "f234oiiO0334Fwer",
  facebook: {
    friends: [{id: 1, name: "alice"}, {id: 2, name: "bob"}]
  },
  twitter: {
    followers: [{id: 1, name: "alice"}, {id: 2, name: "bob"}]
  },
  instagram: {
    photos: [{id: 27, src: "http://coolimage.com"}]
  }
}
```

Upon inspection, each piece of data comes from a different system/API.  The basic
account info may come from our own system (a DB perhaps, mysql, mongo, etc), the
facebook, twitter, and instagram info probably comes from their public APIs.

The goal of loverly-frankenstein is to give you an easy-to-use interface to deal
with multiple data sources as a single object. Imagine a world where you could
manipulate all of the various data sources as part of the same object and then
simply call:

    user.save(callback);

And just like that, all of the various API's and DB's where called in the right
order and with the right calls.  Too good to be true?  Probably.  That's why this
library's not done yet :P


## What is a model?

Like the above example, a model is a representation of your data.  It contains a
specific structure, and provides a consistent API for reading and listing instances
of that particular model.

The magic of a model is that fields can be re-organized and aliased into new names
to suit your particular application needs.  For example this:

    {name: "brandon", joined: "2014-01-01"}

Can become:

    {full_name: "brandon", important_dates: {joined: {year: 2014, month: 1, day: 1}}}

with a few simple manipulations.  This is especially useful in legacy applications
where data has non-sensical names or structures that must be tolerated for some
transition period before it can be reorganized into a better schema.

Possibly more useful, it also provides

## Everything is a Data Source

Models in loverly-frankenstein are retrieve and manipulate their data via their
data sources.  Each data source is responsible for a set number of fields within
a model and each source is treated as separate and unrelated to other data sources
except via the model.

A data source can be:

* A table in a DB
* An web API
* A file on disk
* An object in memory
* Another model!

An interesting design element is that models implement the same API as data sources
do, and can therefore be used as data sources for other higher-level models.  This
isn't a great idea, as the number of operations needed to retrieve data for a
model will probably vastly increase as you "frankenstein" more of these models
together, however it is useful for creating distinct views and combinations of
existing data.


## The price of abstraction

Efficiency is always the first sacrifice in a generally-applicable tool.  Many
performance tweaks rely on knowledge of a particular API or DB system in order
to optimize a specific operation.  For example, every data source is treated as
logically separate (except through defined key-based relationships) and have no
interaction together.  Therefore when we define relationships between multiple
tables in a DB it takes more work to create the same join statement that direct
querying would easily enable.

These kind of limitations can be circumvented by defining a higher-level Data Source
that is represented by the joining of the multiple tables, but this comes with
cost of increased complexity and slightly more difficult maintenance (for the
sake of performance).


# Creating a model

A model is composed of the following pieces:

* name
* definition
* views
* sources
* queries

The __name__ is the model's name (obvious).  I like to use the general convention
of model name + "Model" for the class and file naming.  For example the "Wedding"
model would have a class and filename of "WeddingModel".

The __definition__ of a model is the core of what the model looks like and how each
field gets its data.  Each property of a model is a field in the output and contains
a type, constraints, views it is included in, and a mapping to a data source.

The __views__ property defines default options for a particular sub-segment of this
model's data.  You can think of a view as a way to filter fields and to make your
reading of data more efficient.  A model will only read from data sources whose
fields are required in a view, so have a minimal view with only the ID or similar
will make the reads much more efficient for a very complex model.  Each field definition
defines what views it should be included in.

The __sources__ property lists out the different data sources for this model (as
described above) and their relationship to this model (one-to-one, one-to-many, etc).

The __queries__ propertly lists saved query configurations for data sources that
allow you to query different data sources in different ways with a named query.
This avoids having repeat query logic everywhere in your code and allows the model
to abstract the physical query parameters that need to be sent to different data
sources to provide the expected result.


## Model Definition

A model definition might look like the following:

```javascript
this.definition = {};

this.definition.id = {
  "type": "STRING",
  "required": true,
  "readOnly": true,
  "views": ["default"],
  "constraints": {
    "isInt": {"msg": "ID must be an integer"}
  },
  "mapping": {
    "type": this.MAPPING_TYPES.FIELD,
    "source": "Source1",
    "alias": "cool_fieldx",
    "serialize": function (data) {
      return parseInt(data, 10);
    },
    "deserialize": function (data) {
      return new String(data);
    }
  }
}
```

The field definition is by far the most complex structure in a model.  It is composed
of:

* __type__ - The data type of the field
* __required__ - Boolean, whether or not this field must be specified
* __readOnly__ - Cannot be modified by updates (usually auto-generated fields)
* __views__ - Which views this field should be included in
* __constraints__ - Field validation for creating/updating
* __mapping__ - Specify which data source this field's information comes from

All of the different field definition options are described in detail below.


### Type

Supported types:

* __BOOLEAN__
* __DATE__
* __INTEGER__
* __NUMBER__
* __STRING__
* __ARRAY__ - Used for submodels with one-to-many relationships


### Required & Read Only

The required field is neccessary because if a field is not required, its validation
is skipped if the field is not defined.  Use required to ensure that the field is
always validated before save.

Read only fields will typically be used for auto-generated data such as auto increment
surrogate keys or timestamps.  Read only fields can never be specified.


### Views

Views are field filters.  They tell the model what data to return to minimize the
number of reads necessary from its disparate data sources and to minimize the
response size from the model.  Only data sources whose fields are included in the
view will be queried for data.


### Constraints

Field constraints are validation requirements on the field.  For example, a username
might require that it be 6-10 characters long, only contain alpha-numeric characters
and is required for the form.

The constraints property on a field is an object that maps to validation functions
on your given validator that you've set on the `this.validator` property.  It must
implement the node.js [validator](https://github.com/chriso/validator.js) library.

Basically it just has a bunch of functions that return `true` or `false` depending
on whether or not the validation has passed.

A validation constraint definition might look like:

```javascript

this.definition.username = {
  type: "STRING",
  views: ['default'],
  required: true,
  constraints: {
    isNotBlank: {
      msg: "Please specify your username."
    },
    isAlphanumericString: {
      msg: "A username must contain only letters or numbers."
    },
    isLength: {
      args: [6, 10],
      msg: "A username must be between 6 and 10 characters long."
    },
    hasAtLeastMinNumbers: {
      args: [2],
      msg: "A username must have at least 2 numbers.",
      isValid: function (val, limit) {
        var minNumRegex = new RegExp("(.*[0-9]{1}.*){" + limit + "}");
        return minNumRegex.test(val);
      }
    },
  }
};

```

Notice that the last item in the list specifies an `isValid` method.  You can
create non-reusable custom validators inline using this method.

Also notice that constraints are specified in order from general to specific so
that way the errors can help the user properly complete the form.  The `isNotBlank`
validator is added to ensure that a custom error message is shown when the user
has left the username as `null`.

Some validators can be modified by specifying constraint arguments, as in the `args`
property on the `isLength` constraint.  The `args` property is an array, where the
value of the field is always the first argument to a validation function, but the
args array is appended after that using the `func.apply(context, args)` method.


### Mapping

#### One-to-one relationships

#### One-to-many relationships


### Serializer & Deserializer


### Extending models

`TODO:` We definitely need a way to easily extend/reuse models

I think the best way to achieve this is to change the way models are defined, to
house the various fields at the `prototype` level, allowing copying to occur through
typical prototypal inheritance like:

```javascript
var AbstractModel = require('loverly-frankenstein').Model;

var ParentModel = function () {
  AbstractModel.call(this);
};

ParentModel.prototype = new AbstractModel();
ParentModel.definition = {};

ParentModel.definition.id = {
  type: 'NUMBER',
  views: ['default'],
  constraints: {}
};

ParentModel.definition.description = {
  type: 'STRING',
  views: ['default'],
  constraints: {}
};

// Create a child model that extends the parent model, but overrides some defs

var ChildModel = function () {
  ParentModel.call(this);
};

ChildModel.prototype = new ParentModel();

ChildModel.prototype.definition.description = {
  type: 'STRING',
  views: ['details'],
  constraints: {
    isLength: {
      args: [1, 2],
      msg: 'Some cool message'
    }
  }
};

```

That way we follow all of the common javascript patterns for inheritance and anyone
can use whatever JS utilities they want for prototype extension.


### Adding a Search Submodel to Your Model

Models have a built-in search concept which will return a list of instances based
off of a query passed to a search model.  Each model may have only one `SEARCH` type
submodel which it will query to obtain a list of IDs to use to generate a list
of objects.


`TODO:` Provide access to the solr client I created as part of frankenstein maybe the same
for the rackspace client and sequelize?


At [loverly](http://lover.ly) we use Solr for our search queries, and therefore
our search models are based off of Solr Data Sources.

Specifically for Solr data sources, there are two types of query syntaxes that
are supported, `edismax` and `lucene`.  This is configured at the Data Source level
if you are using the built-in (loverly) Solr client.

The source can be added to the model like:

```javascript
this.sources = {
  "ImageSearch": {
    "relationship": this.SOURCE_MAPPING_TYPES.SEARCH
  }
}
```

The search model should be defined like a typical model with solr as a data source.
Once that is configured, you can call the search endpoint like:

```javascript
// edismax example
var searchQuery = {
  term1: '+', // this term is mandatory in the search results
  term2: '-', // this term is prohibited (excluded) in search results
  term3: '',  // this term is optional
  term4: '',  // this term is also optional
};
var options = {
  /* typical model list options */
  handler: 'similar',      // request handler
  parser: 'edismax',       // parser
  search_field: 'image_id' // field to search against in the current model's sources
};
model.search(searcQuery, options, callback);

// lucene example
// The lucene type only supports the "q" param where you specify the raw lucene
// query
var searchQuery = {
  q: '+field1:term1 -field1:term2 field2:term3 field2:term4'
};
var options = {/* typical model list options */}
model.search(searcQuery, options, callback);
```

For the edismax parser, the fields where the different terms (keywords), are
searched are configured by the search request handler.  The weighting (boosts) are
also configured in the request handler.  The terms can be controlled with `+`, `-`,
or blank for required, excluded, and optional terms respectively.

For the lucene parser, the raw query must be generated (for now) and placed into
the `q` parameter.  The query should follow the lucene syntax and will specify
field/value pairs, plus whatever else you want.  This is for more complex queries
involving multiple fields where one field's value is mandatory and another is optional.

The search function returns the same result structure as the `list()` method with
the same options.  This is because the search method first calls the search model
to get a list of IDs then uses that as a filter parameter for calling the `list()`
method on the model.  The field that is filtered is determined by the `search_field`
in the options, defaulting to `id`.

Search models must always return an `id` property.  This is transformed into an
array and given to the parent model's list method for filtering, using an `in` style
query.  The data source may return a different property, but this should be aliased
at the model layer to be `id` (i.e. `image_id` is transformed to just `id` using
the `mapping` property on the field with an `alias`).



### Lists with One-to-Many Relationships (Data Decoration)

`TODO:`  Need to do this by default if the one-to-many field is included in the
results.


# Creating your own data sources
## Integrating an external API


## Setting up the CRUD routes

# Examples

# Run the Tests
