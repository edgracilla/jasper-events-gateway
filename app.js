'use strict'

const reekoh = require('reekoh')
const plugin = new reekoh.plugins.Gateway()
const isEmpty = require('lodash.isempty')

let server = null

plugin.once('ready', function () {
  let hpp = require('hpp')
  let parse = require('xml2js').parseString
  let async = require('async')
  let helmet = require('helmet')
  let crypto = require('crypto')
  let config = require('./config.json')
  let express = require('express')
  let bodyParser = require('body-parser')

  let options = plugin.config

  if (isEmpty(options.url)) {
    options.url = config.url.default
  } else {
    options.url = (options.url.startsWith('/')) ? options.url : `/${options.url}`
  }

  let app = express()

  app.use(bodyParser.urlencoded({
    extended: true
  }))

  app.disable('x-powered-by')
  app.use(helmet.xssFilter({setOnOldIE: true}))
  app.use(helmet.frameguard('deny'))
  app.use(helmet.ieNoOpen())
  app.use(helmet.noSniff())
  app.use(hpp())

  app.post((options.url.startsWith('/')) ? options.url : `/${options.url}`, (req, res) => {
    let reqObj = req.body

    if (isEmpty(reqObj)) return res.sendStatus(400)

    async.waterfall([
      (done) => {
        if (isEmpty(options.sharedSecret)) return done()

        let hash = crypto.createHash('sha256').update(reqObj.timestamp).digest('base64')

        if (hash !== reqObj.signature) {
          done(new Error('Invalid event signature.'))
        } else {
          done()
        }
      },
      (done) => {
        parse(reqObj.data, {
          trim: true,
          normalize: true,
          explicitRoot: false,
          explicitArray: false,
          ignoreAttrs: true
        }, done)
      },
      (eventData, done) => {
        reqObj.device = eventData.iccid
        reqObj.data = eventData
        done()
      },
      (done) => {
        plugin.requestDeviceInfo(reqObj.device).then((deviceInfo) => {

          if (isEmpty(deviceInfo)) {
            return plugin.log(JSON.stringify({
              title: 'Jasper Events Gateway - Access Denied. Unauthorized Device',
              device: reqObj.device
            }))
          }

          return plugin.pipe(reqObj).then(() => {
            return plugin.log(JSON.stringify({
              title: 'Jasper Events Gateway - Data Received',
              device: reqObj.device,
              data: reqObj
            })).then(() => {
              plugin.emit('data.ok')
              done()
            })
          }).catch(done)
        }).catch(done)
      }
    ], (error) => {
      if (error) {
        plugin.logException(error)
        if (error.message === 'Invalid event signature.') {
          return res.sendStatus(403)
        }
      }
      res.sendStatus(200)
    })
  })

  app.use((error, req, res, next) => {
    plugin.logException(error)

    res.sendStatus(500)
  })

  app.use((req, res) => {
    res.sendStatus(404)
  })

  server = require('http').Server(app)

  server.once('error', function (error) {
    console.error('Jasper Events Gateway Error', error)
    plugin.logException(error)

    setTimeout(() => {
      server.close(() => {
        server.removeAllListeners()
        process.exit()
      })
    }, 5000)
  })

  server.once('close', () => {
    plugin.log(`Jasper Events Gateway closed on port ${options.port}`)
  })

  server.listen(options.port, () => {
    plugin.log(`Jasper Events Gateway has been initialized on port ${options.port}`)
    plugin.emit('init')
  })
})

module.exports = plugin

