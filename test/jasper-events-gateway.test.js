'use strict';

const PORT = 8080;

var cp     = require('child_process'),
	should = require('should'),
	gateway;

describe('Gateway', function () {
	this.slow(5000);

	after('terminate child process', function (done) {
		this.timeout(6000);

		setTimeout(function () {
			gateway.kill('SIGKILL');
			done();
		}, 3000);
	});

	describe('#spawn', function () {
		it('should spawn a child process', function () {
			should.ok(gateway = cp.fork(process.cwd()), 'Child process not spawned.');
		});
	});

	describe('#handShake', function () {
		it('should notify the parent process when ready within 5 seconds', function (done) {
			this.timeout(5000);

			gateway.on('message', function (message) {
				if (message.type === 'ready')
					done();
				else if (message.type === 'requestdeviceinfo') {
					if (message.data.deviceId === '8901311242888845458') {
						gateway.send({
							type: message.data.requestId,
							data: {
								_id: message.data.deviceId
							}
						});
					}
				}
			});

			gateway.send({
				type: 'ready',
				data: {
					options: {
						port: PORT
					}
				}
			}, function (error) {
				should.ifError(error);
			});
		});
	});

	describe('#data', function () {
		it('should process the data', function (done) {
			this.timeout(5000);

			let request = require('request');

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
				should.ifError(error);
				should.equal(response.statusCode, 200, `Response Status should be 200. Status: ${response.statusCode}`);
				done();
			});
		});
	});
});