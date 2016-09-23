'use strict';

var isEmpty  = require('lodash.isempty'),
	platform = require('./platform'),
	server;

/**
 * Emitted when the platform shuts down the plugin. The Gateway should perform cleanup of the resources on this event.
 */
platform.once('close', function () {
	let d = require('domain').create();

	d.once('error', function (error) {
		console.error(error);
		platform.handleException(error);
		platform.notifyClose();
		d.exit();
	});

	d.run(function () {
		server.close(() => {
			server.removeAllListeners();
			platform.notifyClose();
			d.exit();
		});
	});
});

/**
 * Emitted when the platform bootstraps the plugin. The plugin should listen once and execute its init process.
 * Afterwards, platform.notifyReady() should be called to notify the platform that the init process is done.
 * @param {object} options The parameters or options. Specified through config.json. Gateways will always have port as option.
 */
platform.once('ready', function (options) {
	let hpp        = require('hpp'),
		parse      = require('xml2js').parseString,
		async      = require('async'),
		helmet     = require('helmet'),
		crypto     = require('crypto'),
		config     = require('./config.json'),
		express    = require('express'),
		bodyParser = require('body-parser');

	if (isEmpty(options.url))
		options.url = config.url.default;
	else
		options.url = (options.url.startsWith('/')) ? options.url : `/${options.url}`;

	var app = express();

	app.use(bodyParser.urlencoded({
		extended: true
	}));

	// For security
	app.disable('x-powered-by');
	app.use(helmet.xssFilter({setOnOldIE: true}));
	app.use(helmet.frameguard('deny'));
	app.use(helmet.ieNoOpen());
	app.use(helmet.noSniff());
	app.use(hpp());

	app.post((options.url.startsWith('/')) ? options.url : `/${options.url}`, (req, res) => {
		let reqObj = req.body;

		if (isEmpty(reqObj)) return res.sendStatus(400);

		async.waterfall([
			(done) => {
				if (isEmpty(options.sharedSecret)) return done();

				let hash = crypto.createHash('sha256').update(reqObj.timestamp).digest('base64');

				if (hash !== reqObj.signature)
					done(new Error('Invalid event signature.'));
				else
					done();
			},
			(done) => {
				parse(reqObj.data, {
					trim: true,
					normalize: true,
					explicitRoot: false,
					explicitArray: false,
					ignoreAttrs: true
				}, done);
			},
			(eventData, done) => {
				reqObj.device = eventData.iccid;
				reqObj.data = eventData;
				done();
			},
			(done) => {
				platform.requestDeviceInfo(reqObj.device, (error, requestId) => {
					if (error) return done(error);

					platform.once(requestId, (deviceInfo) => {
						if (deviceInfo) {
							platform.processData(reqObj.device, JSON.stringify(reqObj));

							platform.log(JSON.stringify({
								title: 'Jasper Events Gateway - Data Received',
								data: reqObj
							}));
						}
						else {
							platform.log(JSON.stringify({
								title: 'Jasper Events Gateway - Access Denied. Unauthorized Device',
								device: reqObj.device
							}));
						}

						done();
					});
				});
			}
		], (error) => {
			if (error) {
				platform.handleException(error);

				if (error.message === 'Invalid event signature.')
					return res.sendStatus(403);
			}

			res.sendStatus(200);
		});
	});

	app.use((error, req, res, next) => {
		platform.handleException(error);

		res.sendStatus(500);
	});

	app.use((req, res) => {
		res.sendStatus(404);
	});

	server = require('http').Server(app);

	server.once('error', function (error) {
		console.error('Jasper Events Gateway Error', error);
		platform.handleException(error);

		setTimeout(() => {
			server.close(() => {
				server.removeAllListeners();
				process.exit();
			});
		}, 5000);
	});

	server.once('close', () => {
		platform.log(`Jasper Events Gateway closed on port ${options.port}`);
	});

	server.listen(options.port, () => {
		platform.notifyReady();
		platform.log(`Jasper Events Gateway has been initialized on port ${options.port}`);
	});
});
