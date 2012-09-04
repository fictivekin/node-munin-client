var net = require('net');

// these don't have a real meaning; they just need to be unique
// and constants are smarter than arbitrary strings
const BANNER = 1;
const LIST = 2;
const FETCH = 3;
const VERSION = 4;
const NODES = 5;
const CONFIG = 6;
const QUIT = 255;

// empty function to use as a default for callbacks
var nocb = function(){};

var Munin = function (host, port) {
	this.host = host;
	this.port = port || 4949;
	this.connecting = false;
	this.connection = undefined;
	this.preConnectBuffer = '';
	this.commandFifo = [{cmd: BANNER, callback: nocb}];
	this.commandBuf = undefined;
	this.closeAfterFifo = false;
	this.hasQuit = false;
};

Munin.prototype = {
	connect: function (callback) {
		callback = callback || nocb;
		this.connecting = true;
		munin = this;
		var client = net.connect(
			{port: this.port, host: this.host},
			function() { //'connect' listener
				// no longer connecting
				this.connecting = false;
				munin.connection = client;
				if (munin.preConnectBuffer) {
					// if we've buffered up commands before the connection happened,
					// drain that buffer into the socket
					client.write(munin.preConnectBuffer);
				}
				callback(client);
			}
		);
		client.on('data', function (data) {
			// fetch data from the socket; this happens to always be in chunks
			// ending in \n for Munin, with my testing, so this makes things
			// slightly easier
			data.toString().split('\n').forEach(function (str) {
				// ignore empty lines
				if (str !== "") {
					munin.dataHandler(str);
				}
			});
		});
		client.on('end', function() {
			munin.connection = false;
		});

	},

	disconnect: function () {
		this.closeAfterFifo = true;
	},

	connectIfNotConnected: function (callback) {
		callback = callback || nocb;
		// initiate a connection if one doesn't exist (and is not in progress)
		if (!this.connection && !this.connecting) {
			this.connect(callback);
		} else {
			callback(this.connection);
		}
	},

	writeToSocket: function (str) {
		munin.preConnectBuffer += str;
	},

	pushCommand: function(cmd, callback) {
		if (munin.hasQuit) {
			throw "Can't send command after `quit`";
		}
		munin.commandFifo.push({cmd: cmd, callback: callback});
	},

	commandComplete: function() {
		munin.commandFifo.shift();
		munin.commandBuf = undefined;
		if (munin.commandFifo.length == 0 && munin.closeAfterFifo && munin.connection) {
			munin.connection.end();
			munin.closeAfterFifo = false;
		}
	},

	dataHandler: function(data) {

		if (!munin.commandFifo.length) {
			throw "Wah-oh. No command in the FIFO.";
		}

		var currentCmd = munin.commandFifo[0];
		switch (currentCmd.cmd) {
			case BANNER:
				// ignore the banner
				munin.commandComplete();
				break;

			case LIST:
				// split the list on space, return array
				var list = data.trim().split(' ');
				currentCmd.callback(list);
				munin.commandComplete();
				break;

			case CONFIG:
				// accumulate until "."
				if (munin.commandBuf === undefined) {
					// object to hold the command buffer
					munin.commandBuf = {};
				}
				if (data == '.') {
					currentCmd.callback(munin.commandBuf);
					munin.commandComplete();
				} else {
					// collect data
					var parts = data.split(' ', 2);
					if (parts[0].indexOf('.') == -1) {
						// if it doesn't contains a dot, that is the name
						munin.commandBuf[parts[0]] = parts[1];
					} else {
						// but if it does, create a sub-object:
						var name = parts[0].split('.', 2);
						if (undefined === munin.commandBuf[name[0]]) {
							munin.commandBuf[name[0]] = {};
						}
						munin.commandBuf[name[0]][name[1]] = parts[1];
					}
				}
				break;

			case FETCH:
				// accumulate until "."
				if (munin.commandBuf === undefined) {
					// object to hold the command buffer
					munin.commandBuf = {};
				}
				if (data == '.') {
					currentCmd.callback(munin.commandBuf);
					munin.commandComplete();
				} else {
					// collect data
					var parts = data.split(' ');
					var name = parts[0].split('.');
					if (name[1] == 'value') {
						// if foo.value, all we really want is foo
						name = name[0];
					} else {
						// but if we get not-.value for some reason, keep it all
						name = parts[0];
					}
					munin.commandBuf[name] = parts[1];
				}
				break;

			case NODES:
				// accumulate until "."
				if (munin.commandBuf === undefined) {
					// object to hold the command buffer
					munin.commandBuf = [];
				}
				if (data == '.') {
					currentCmd.callback(munin.commandBuf);
					munin.commandComplete();
				} else {
					// collect data
					munin.commandBuf.push(data);
				}
				break;

			case VERSION:
				// expect munins node on fkops02.prod.fictivevpn.com version: 1.4.5
				var matches = data.match(/^munins node on (.*?) version: (.*)$/);
				currentCmd.callback({node: matches[1], version: matches[2]});
				munin.commandComplete();
				break;

		}
	},

	list: function (callback) {
		callback = callback || nocb;
		this.connectIfNotConnected();
		this.pushCommand(LIST, callback);
		this.writeToSocket('list\n');
	},

	config: function (metricName, callback) {
		callback = callback || nocb;
		this.connectIfNotConnected();
		this.pushCommand(CONFIG, callback);
		this.writeToSocket('config ' + metricName + '\n');
	},

	fetch: function (metricName, callback) {
		callback = callback || nocb;
		this.connectIfNotConnected();
		this.pushCommand(FETCH, callback);
		this.writeToSocket('fetch ' + metricName + '\n');
	},

	version: function (callback) {
		callback = callback || nocb;
		this.connectIfNotConnected();
		this.pushCommand(VERSION, callback);
		this.writeToSocket('version\n');
	},

	nodes: function (callback) {
		callback = callback || nocb;
		this.connectIfNotConnected();
		this.pushCommand(NODES, callback);
		this.writeToSocket('nodes\n');
	},

	quit: function () {
		this.hasQuit = true;
		if (this.connection || this.connecting) {
			this.writeToSocket('quit\n');
		}
	}

};

module.exports = Munin;
