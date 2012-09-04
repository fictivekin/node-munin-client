A simple Munin client for node.js
=================================

Access Munin metrics by opening up the port and then pointing your node code
at the munin node.

Example
-------

    var Munin = require('munin.js');
    var munin = new Munin('munin-node.example.com');

    munin.list(console.log);
    munin.version(console.log);
    munin.nodes(console.log);
    munin.fetch('cpu', console.log);
    munin.config('swap', console.log);
    munin.quit();
