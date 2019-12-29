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
        this.cliByMxId = {};
        this.cliByDBNum = {};
        this.cliByMUDUser = {};
        this.mudNameByDBNum = {};
    }

    start()
    {
        for (let index in this.config.users) {
            let ucfg = this.config.users[index];
            let isMain = ucfg.mud.username == this.app.mainUname;
            let client = new MUDClient(this, this.config.mud, ucfg,
                                       this.dedup, isMain);
            if (isMain)
                this.mainClient = client;
            this.cliByMxId[ucfg.puppet.id] = client;
            this.cliByDBNum[ucfg.mud.dbnum] = client;
            this.cliByMUDUser[ucfg.mud.username] = client;
            this.mudNameByDBNum[ucfg.mud.dbnum] = ucfg.mud.username;
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
    }

    getMudClientByMxId(id) {
        if (id in this.cliByMxId)
            return [true, this.cliByMxId[id]];
        else
            return [false, this.mainClient];
    }

    getMudClientByDBNum(dbnum) {
        if (dbnum in this.cliByDBNum)
            return [true, this.cliByDBNum[dbnum]];
        else
            return [false, this.mainClient];
    }

    getMudClientByMUDUser(mud_user) {
        if (mud_user in this.cliByMUDUser)
            return [true, this.cliByMUDUser[mud_user]];
        else
            return [false, this.mainClient];
    }

    getMudNameByDBNum(dbnum) {
        if (dbnum in this.mudNameByDBNum)
            return this.mudNameByDBNum[dbnum];
        else
            return null;
    }

    sendToMud(id, text, data)
    {
        console.log(`sendToMud: ${id}`);
        const [found, cli] = this.getMudClientByMxId(data.sender)
        return cli.send(text, utils.idMatrixToMud(data.sender), found);
    }

    sendEmoteToMud(id, text, data)
    {
        const [found, cli] = this.getMudClientByMxId(data.sender)
        return cli.sendEmote(text, utils.idMatrixToMud(data.sender), found);
    }
}

module.exports = MUDController;
