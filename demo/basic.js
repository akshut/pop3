var assert = require('assert');
var util = require('util');
var Fiber = require('fibers');
var pop3 = require("../lib/index.js");

var client = pop3.Client({});

var fiber;
function work() {
	fiber = Fiber.current;

	client.on('response',
    	function(type, success, data) {
        	util.debug('response: ' + type + ' success: ' + success );
        	fiber.run();
    	});

	client.connect('pop.domain.com', 'USERNAME', 'PASSWORD');
	Fiber.yield();

	client.user('USERNAME');
	Fiber.yield();

	client.pass('PASSWORD');
	Fiber.yield();

	client.list();
	Fiber.yield();

	client.quit();
	Fiber.yield();
}

Fiber(function() { work(); }).run();

