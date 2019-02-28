const { ApolloServer, gql } = require('apollo-server-express')
const express = require('express')
const Http = require('http')
const createIo = require('socket.io')
const r = require('ramda')
const { MongoClient, ObjectId } = require('mongodb')
const { GraphQLDateTime } = require('graphql-iso-date')
const { json } = require('body-parser')
const { graphql } = require('body-parser-graphql')


const typeDefs = gql`
  scalar Date

  type Survey {
    id: ID!
    name: String!
    answers: [String]!
    nbAnswers: Int!
    createdAt: Date
    by: String!
  }

  type Answer {
    id: ID!
    survey: ID!
    answers: [Int]!
    by: String
    createdAt: Date!
  }

  type Query {
    hello: String
    surveys: [Survey]!
    answers(survey: ID!): [Answer]!
    survey(participant: String!, id: ID): Survey
  }

  input NewSurvey {
    name: String!
    answers: [String]!
    by: String
  }

  input NewAnswer {
    survey: ID!
    answers: [Int]!
    by: String
  }

  type Mutation {
    addNewSurvey(input: NewSurvey!): Survey!
    sendAnswer(input: NewAnswer!): Survey!
  }
`

const app = express()

app.use(json())
app.use(graphql())


const server = Http.createServer(app)


const io = createIo(server)


const resolvers = {
  Query: {
    hello: () => 'hello from graphql',

    surveys: (parent, args, { db }) => db
      .collection('surveys')
      .find()
      .sort({ createdAt: -1 })
      .toArray(),

    answers: (parent, { survey }, { db }) => db
      .collection('answers')
      .find({ survey })
      .sort({ createdAt: -1 })
      .toArray(),
  },

  Mutation: {
    addNewSurvey: (parent, { input }, { db }) => db
      .collection('surveys')
      .insertOne(formatSurvey(input))
      .then(result => result.ops[0])
      .then(r.tap(survey => io.sockets.emit('newSurvey', survey)))
      .then(r.tap(survey => console.warn('NEW SURVEY'))),

    sendAnswer: (parent, { input }, { db }) => db
      .collection('answers')
      .insertOne({
        ...input,
        createdAt: new Date(),
      })
      .then(result => result.ops[0])
      .then(answer => answer.survey)
      .then(id => db
        .collection('surveys')
        .findOne({ _id: ObjectId(id) })
      )
      .then(r.tap(console.warn))
      .then(r.tap(survey => io.sockets.emit('newAnswer', survey))),
  },
  Survey: {
    id: (parent) => String(parent._id),
    by: (parent) => parent.by || 'Anonymous',
    nbAnswers: (parent, arg, { db }) => db
      .collection('answers')
      .countDocuments({ survey: parent._id }),
  },
  Answer: {
    id: (parent) => String(parent._id),
  }
}


formatSurvey = survey => ({
  ...survey,
  createdAt: new Date()
})



const apolloServer = new ApolloServer({
  typeDefs,
  resolvers: r.mergeLeft(
    { Date: GraphQLDateTime },
    resolvers,
  ),
  context: () => client
    .then(client => client.db('knoodle'))
    .then(database => ({
      db: database
    })),
})


apolloServer.applyMiddleware({ app })


io.on('connection', socket => {
  console.log(`Hello client #${socket.id}`)

  socket.on('disconnect', reason => console.log(`Goodbye client #${socket.id}`))
})


if (require.main === module) {
  server.listen({ host: '0.0.0.0', port: 9090 }, () =>
    console.log('Server is listening on http://localhost:9090')
  )
}


client = MongoClient
  .connect(
    'mongodb://root:root@mongo:27017/?authMechanism=DEFAULT&authSource=admin',
    { useNewUrlParser: true }
  )
