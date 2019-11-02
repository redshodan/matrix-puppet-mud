// const JSON = require('JSON');
const debug = require('debug');
const debugVerbose = debug('verbose:matrix-puppet:mud:client');
const EventEmitter = require('events').EventEmitter;
const Promise = require('bluebird');
const MUDClient = require('./mudclient');
const utils = require('./mudutils.js');

class MUDController extends EventEmitter
{
    constructor(app, config, dedup)
    {
        super();
        this.app = app;
        this.config = config;
        this.dedup = dedup;
        this.mainClient = null;
        this.clients = [];
        this.cliByMxId = {};
        this.cliByDbNum = {};
    }

    start()
    {
        for (let index in this.config.users) {
            let ucfg = this.config.users[index];
            let isMain = ucfg.mud.username == this.app.mainUname;
            let client = new MUDClient(this, this.config.mud, ucfg.mud,
                                       this.dedup, isMain);
            if (isMain)
                this.mainClient = client;
            this.cliByMxId[ucfg.puppet.id] = client;
            this.cliByDbNum[ucfg.mud.dbnum] = client;
            this.clients.push(client);
            client.connect();

            client.on('status', (statusTxt)=> {
                this.app.sendStatusMsg({}, statusTxt);
            });

            client.on('message', (data)=> {
                try {
                    return this.app.handleThirdPartyRoomMessage(data);
                } catch(er) {
                    console.log("incoming message handling error:", er);
                    this.sendStatusMsg(
                        {}, "incoming message handling error:", err);
                }
            });
        }
        // console.log("cliByMxId:");
        // console.log(JSON.stringify(this.cliByMxId));
    }

    getMudClientByMxId(id) {
        // console.log(`getMudClientByMxId: ${id}`);
        if (id in this.cliByMxId)
        {
            // console.log(`${id} found`);
            // console.log(this.cliByMxId[id]);
            return this.cliByMxId[id];
        }
        else
            return this.mainClient;
    }

    sendToMud(id, text, data)
    {
        return this.getMudClientByMxId(data.sender).send(text);
    }

    sendEmoteToMud(id, text, data)
    {
        return this.getMudClientByMxId(data.sender).sendEmote(text);
    }
}

module.exports = MUDController;
