/*
Test cases for regular expressions
*/

var assert = require('assert');

var pop3 = require("../lib/index.js");


suite("RegEx", function() {

	test("ok", function() {

		var client = pop3.Client({});
		var rx = client.patterns.ok;
		var match, data;

		data = "+OK pop.host.com ready\r\n";
		assert(match = rx.exec(data));
		assert.equal(match[1], "pop.host.com ready");

		data = "+ok \r\n";
		assert(match = rx.exec(data));

		data = "-OK pop.host.com ready\r\n";
		assert.equal(match = rx.exec(data), null);


		data = "-ERR pop.host.com ready\r\n";
		assert.equal(match = rx.exec(data), null);

		data = "OK pop.host.com ready\r\n";
		assert.equal(match = rx.exec(data), null);

	});

	test("err", function() {

		var client = pop3.Client({});
		var rx = client.patterns.err;
		var match, data;

		data = "-ERR pop.host.com service unavailable\r\n";
		assert(match = rx.exec(data));
		assert.equal(match[1], "pop.host.com service unavailable");

		data = "-err \r\n";
		assert(match = rx.exec(data));

		data = "+ERR pop.host.com ready\r\n";
		assert.equal(match = rx.exec(data), null);


		data = "+OK pop.host.com ready\r\n";
		assert.equal(match = rx.exec(data), null);

		data = "ERR pop.host.com ready\r\n";
		assert.equal(match = rx.exec(data), null);

	});

	test("garbage", function() {

		var client = pop3.Client({});
		var rx = client.patterns.garbage;
		var match, data;

		data = "-ERR pop.host.com service unavailable\r\n";
		assert(match = rx.exec(data));
		assert.equal(match[1], "-ERR pop.host.com service unavailable");

		data = "\r\n";
		assert(match = rx.exec(data));

		data = "ERR pop.host.com ready\r\n";
		assert(match = rx.exec(data));

	});

	test("okML", function() {

		var client = pop3.Client({});
		var rx = client.patterns.okML;
		var match, data;

		data = "+OK unique ids follow\r\n1\r\n\2\r\n.. etc\r\n.\r\n";
		assert(match = rx.exec(data));

		data = "+OK unique ids follow\r\n1\r\n\2\r\n.etc\r\n.\r\n";
		assert.equal(match = rx.exec(data), null);

		data = "+OK unique ids follow\r\n.\r\n";
		assert(match = rx.exec(data));

		data = "+OK unique ids follow\r\n..\r\n.\r\n";
		assert(match = rx.exec(data));
	});
});
