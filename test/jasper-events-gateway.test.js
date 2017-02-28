/* global describe, it, before, after */
'use strict'

const async = require('async')
const should = require('should')
const Broker = require('../node_modules/reekoh/lib/broker.lib')

const PORT = 8182
const PLUGIN_ID = 'demo.gateway'
const BROKER = 'amqp://guest:guest@127.0.0.1/'
const OUTPUT_PIPES = 'demo.outpipe1,demo.outpipe2'
const COMMAND_RELAYS = 'demo.relay1,demo.relay2'

let conf = {
  port: PORT,
  url: '/events'
}

let _app = null
let _broker = null

describe('Gateway', function () {
  before('init', () => {
    process.env.BROKER = BROKER
    process.env.PLUGIN_ID = PLUGIN_ID
    process.env.OUTPUT_PIPES = OUTPUT_PIPES
    process.env.COMMAND_RELAYS = COMMAND_RELAYS
    process.env.CONFIG = JSON.stringify(conf)

    _broker = new Broker() // tester broker
  })

  after('terminate', function () {

  })

  describe('#start', function () {
    it('should start the app', function (done) {
      this.timeout(10000)
      _app = require('../app')
      _app.once('init', done)
    })
  })

  describe('#test RPC preparation', () => {
    it('should connect to broker', (done) => {
      _broker.connect(BROKER).then(() => {
        return done() || null
      }).catch((err) => {
        done(err)
      })
    })

    it('should spawn temporary RPC server', (done) => {
      // if request arrives this proc will be called
      let sampleServerProcedure = (msg) => {
        // console.log(msg.content.toString('utf8'))
        return new Promise((resolve, reject) => {
          async.waterfall([
            async.constant(msg.content.toString('utf8')),
            async.asyncify(JSON.parse)
          ], (err, parsed) => {
            if (err) return reject(err)
            parsed.foo = 'bar'
            resolve(JSON.stringify(parsed))
          })
        })
      }

      _broker.createRPC('server', 'deviceinfo').then((queue) => {
        return queue.serverConsume(sampleServerProcedure)
      }).then(() => {
        // Awaiting RPC requests
        done()
      }).catch((err) => {
        done(err)
      })
    })
  })

  describe('#data', function () {
    it('should process the data', function (done) {
      this.timeout(10000)

      let request = require('request')

      request.post({
        url: `http://localhost:${PORT}/events`,
        form: {
          eventId: 'SESSION_START-123',
          eventType: 'SESSION_START',
          timestamp: '2010-01-07T01:20:55.685Z',
          signature: '8DYYAlzX5TbzChTK/qpMWdi8flA=',
          data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Session xmlns="http://api.jasperwireless.com/ws/schema"><iccid>8901311242888845458</iccid><ipAddress>12.34.56.78</ipAddress><dateSessionStarted>2010-01-07T01:20:55.200Z</dateSessionStarted><dateSessionEnded>2010-01-07T01:20:55.200Z</dateSessionEnded></Session>'
        },
        gzip: true
      }, (error, response, body) => {
        should.ifError(error)
        should.equal(response.statusCode, 200, `Response Status should be 200. Status: ${response.statusCode}`)
      })

      _app.on('data.ok', done)
    })
  })
})
