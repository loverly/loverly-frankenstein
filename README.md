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

### Data types

### Aliases

### One-to-one relationships

### One-to-many relationships

### Many-to-many relationships


# Creating your own data sources
## Integrating an external API


## Setting up the CRUD routes

# Examples

# Run the Tests
