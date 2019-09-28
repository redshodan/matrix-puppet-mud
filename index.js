const {
    MatrixAppServiceBridge: {
        Cli, AppServiceRegistration
    },
    MatrixPuppetBridgeBase,
    utils
} = require("matrix-puppet-bridge");
const Puppet = require('./puppet');
const MUDClient = require('./client');
const config = require('./config.json');
const path = require('path');
const debug = require('debug');
const debugVerbose = debug('verbose:matrix-puppet:mud:index');
const mudUtils = require('./utils.js');


class App extends MatrixPuppetBridgeBase {
    getServicePrefix() {
        return config.servicePrefix;
    }
    getServiceName() {
        return config.serviceName;
    }
    defaultDeduplicationTag() {
        return " \u200b"; // Unicode Character 'ZERO WIDTH SPACE'
    }
    defaultDeduplicationTagPattern() {
        return " \\u200b$"; // Unicode Character 'ZERO WIDTH SPACE'
    }
    initThirdPartyClient() {
        this.threadInfo = {};
        this.userId = null;
        this.clients = [];
        for (let uname in config.users) {
            let client = new MUDClient(config, config.users[uname],
                                       this.defaultDeduplicationTag(),
                                       uname == mainUname);
            config.users[uname].mudclient = client;
            this.clients.push(client);
            client.connect();

            client.on('status', (statusTxt)=> {
                this.sendStatusMsg({}, statusTxt);
            });

            client.on('message', (data)=> {
                try {
                    this.threadInfo[data.conversation_id] = {
                        conversation_name: data.conversation_name,
                    };
                    return this.handleThirdPartyRoomMessage(data);
                } catch(er) {
                    console.log("incoming message handling error:", er);
                    this.sendStatusMsg({}, "incoming message handling error:", err);
                }
            });
        }
    }

    // Override to map to the right matrix client
    getUserClient(roomId, senderId, senderName, avatarUrl, doNotTryToGetRemoteUserStoreData) {
        console.log("getUserClient", senderId, senderName);
        if (senderId === undefined)
            return Promise.resolve(this.puppet.getClient());
        else if (senderId in config.users) {
            const user = config.users[senderId];
            return Promise.resolve(user.mxclient.getClient());
        }
        else
            return super.getUserClient(roomId, senderId, senderName, avatarUrl,
                                       doNotTryToGetRemoteUserStoreData);
    }

    // Override to make msgtype settable
    handleThirdPartyRoomMessage(thirdPartyRoomMessageData) {
        console.log('handling third party room message', thirdPartyRoomMessageData);
        let {
            roomId,
            senderName,
            senderId,
            avatarUrl,
            text,
            html,
            msgtype
        } = thirdPartyRoomMessageData;

        msgtype = msgtype || "m.txt";

        return this.getOrCreateMatrixRoomFromThirdPartyRoomId(roomId).then((matrixRoomId) => {
            return this.getUserClient(matrixRoomId, senderId, senderName, avatarUrl).then((client) => {
                if (senderId === undefined) {
                    console.log("this message was sent by me, but did it come from a matrix client or a 3rd party client?");
                    console.log("if it came from a 3rd party client, we want to repeat it as a 'notice' type message");
                    console.log("if it came from a matrix client, then it's already in the client, sending again would dupe");
                    console.log("we use a tag on the end of messages to determine if it came from matrix");

                    if (this.isTaggedMatrixMessage(text)) {
                        console.log('it is from matrix, so just ignore it.');
                        return;
                    } else {
                        console.log('it is from 3rd party client');
                    }
                }

                let tag = utils.autoTagger(senderId, this);

                if (html) {
                    return client.sendMessage(matrixRoomId, {
                        body: tag(text),
                        formatted_body: html,
                        format: "org.matrix.custom.html",
                        msgtype: msgtype
                    });
                } else {
                    return client.sendMessage(matrixRoomId, {
                        body: tag(text),
                        msgtype: msgtype
                    });
                }
            });
        });
            // .catch(err=>{
            // super.sendStatusMsg({}, 'Error in '+this.handleThirdPartyRoomMessage.name, err, thirdPartyRoomMessageData);
        // });
    }

    // Override to not send warning message that can cause a message loop and
    // add in m.emote support
    handleMatrixMessageEvent(data) {
        const { room_id, content: { body, msgtype } } = data;
        const thirdPartyRoomId = this.getThirdPartyRoomIdFromMatrixRoomId(room_id);
        const isStatusRoom = thirdPartyRoomId === this.getStatusRoomPostfix();

        if (!thirdPartyRoomId) {
            return;
        } else if (isStatusRoom) {
            // Sometimes the base class sends a warning which can trigger a
            // message loop. so just don't do that nonsense.
            return;
        } else {
            if (msgtype === 'm.emote') {
                promise = () => this.sendEmoteAsPuppetToThirdPartyRoomWithId(thirdPartyRoomId, msg, data);
                return promise().catch(err=>{
                    this.sendStatusMsg({}, 'Error in '+this.handleMatrixEvent.name, err, data);
                });
            }
        }
        return super.handleMatrixMessageEvent(data);
    }

    getThirdPartyRoomDataById(id) {
        debugVerbose("getThirdPartyRoomDataById()", id)
        let roomData = {
            name: this.threadInfo[id].conversation_name,
            topic: `${config.serviceName} Chat`
        };
        return roomData;
    }
    sendReadReceiptAsPuppetToThirdPartyRoomWithId() {
        // no op for a MUD
    }

    getMudClient(id) {
        let mud_id = mudUtils.idMatrixToMud(id);
        for (let uname in config.users) {
            if (uname == mud_id)
                return config.users[uname].mudclient;
        }
        return mainUser.mudclient;
    }

    sendMessageAsPuppetToThirdPartyRoomWithId(id, text, data) {
        return this.getMudClient(data.sender).send(id, text);
    }

    sendEmoteAsPuppetToThirdPartyRoomWithId(id, text, data) {
        return this.getMudClient(data.sender).sendEmote(id, text);
    }

    sendImageMessageAsPuppetToThirdPartyRoomWithId(
        _thirdPartyRoomId, _data, _matrixEvent) {
        console.log("sendImageMessageAsPuppetToThirdPartyRoomWithId: Generate url to send to MUD?");
        // Nothing to do for a MUD with this
        return Promise.resolve(true);
    }
    sendFileMessageAsPuppetToThirdPartyRoomWithId(_thirdPartyRoomId, _data,
                                                  _matrixEvent) {
        console.log("sendFileMessageAsPuppetToThirdPartyRoomWithId: Generate url to send to MUD?");
        // Nothing to do for a MUD with this
        return Promise.resolve(true);
    }
    sendReadReceiptAsPuppetToThirdPartyRoomWithId(_thirdPartyRoomId) {
        console.log("sendReadReceiptAsPuppetToThirdPartyRoomWithId");
        // Nothing to do for a MUD with this
        return Promise.resolve(true);
    }
}

const mainUname = config.bridge.puppet;
const mainUser = config.users[mainUname];
const mainPuppet = new Puppet(path.join(__dirname, './config.json' ),
                              config, mainUser.puppet);
mainUser.puppet = mainPuppet;

new Cli({
    port: config.port,
    registrationPath: config.registrationPath,
    generateRegistration: function(reg, callback) {
        mainPuppet.associate().then(()=>{
            reg.setId(AppServiceRegistration.generateToken());
            reg.setHomeserverToken(AppServiceRegistration.generateToken());
            reg.setAppServiceToken(AppServiceRegistration.generateToken());
            reg.setSenderLocalpart("mudbot");
            reg.addRegexPattern("users", `@${config.servicePrefix}_.*`, true);
            reg.addRegexPattern("aliases", `#${config.servicePrefix}_.*`, true);
            callback(reg);
        }).catch(err=>{
            console.trace();
            console.error(err.message);
            process.exit(-1);
        });
    },
    run: function(port) {
        // Login users
        for (let uname in config.users) {
            const user = config.users[uname];
            if (uname == mainUname)
                continue;
            console.log(`Logging ${uname} into Matrix...`);
            user.mxclient = new Puppet(path.join(__dirname, './config.json' ),
                                      config, user.puppet);
            user.mxclient.startClient();
        }
        console.log("Starting app...");
        const app = new App(config, mainPuppet);
        console.log(`Logging main user ${mainUname} into Matrix...`);
        return mainPuppet.startClient().then(()=>{
            return app.initThirdPartyClient();
        }).then(() => {
            return app.bridge.run(port, config);
        }).then(()=>{
            console.log('Matrix-side listening on port %s', port);
        })
        // .catch(err=>{
        //     console.error(err.message);
        //     process.exit(-1);
        // });
    }
}).run();
