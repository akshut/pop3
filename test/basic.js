var assert = require('assert');

var pop3 = require("../lib/index.js");


suite("POP3Client", function() {

	test("create client", function() {

		var client = pop3.Client({});
	});

	test("connect", function() {

		var client = pop3.Client({});
		client.connect('pop.mail.yahoo.com', 'anilkn@yahoo.com', 'test');
	});
});
