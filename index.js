const
{
    MatrixAppServiceBridge:
    {
        Cli, AppServiceRegistration
    },
    MatrixPuppetBridgeBase,
    utils
} = require("matrix-puppet-bridge");
const path = require('path');
const debug = require('debug');
const debugVerbose = debug('verbose:matrix-puppet:mud:index');
const MUDPuppet = require('./src/mudpuppet');
const MUDController = require('./src/mudcontroller');
const mudutils = require('./src/mudutils');
const config = require('./config.json');


const thirdpty_msg = (
    "this message was sent by me, but did it come from a matrix client or a " +
    "3rd party client? if it came from a 3rd party client, we want to repeat " +
    "it as a 'notice' type message. if it came from a matrix client, then " +
    "it's already in the client, sending again would dupe. we use a tag on " +
    "the end of messages to determine if it came from matrix"
);


class App extends MatrixPuppetBridgeBase
{
    constructor(config, puppet)
    {
        super(config, puppet);
        this.mainUname = mainUname;
        this.mainUser = mainUser;
        this.mainPuppet = mainPuppet;
    }

    getServicePrefix() {return config.servicePrefix;}

    getServiceName() {return config.serviceName;}

    // Unicode Character 'ZERO WIDTH SPACE'
    defaultDeduplicationTag() {return " \u200b";}

    // Unicode Character 'ZERO WIDTH SPACE'
    defaultDeduplicationTagPattern() {return " \\u200b$";}

    initThirdPartyClient()
    {
        this.userId = null;
        this.clients = [];
        this.mudctlr = new MUDController(this, config,
                                         this.defaultDeduplicationTag());
        this.mudctlr.start();
    }

    getMultiUserPuppet(senderId)
    {
        console.log(`getMultiUserPuppet: ${senderId}`);
        if (senderId === undefined)
            return this.puppet;
        else
            return this.mudctlr.getPuppetByMxId(senderId);
        // else if (senderId in config.users)
        // {
        //     const user = config.users[senderId];
        //     return user.mxclient;
        // }
    }

    // Override to map to the right matrix client
    getUserClient(roomId, senderId, senderName, avatarUrl,
                  doNotTryToGetRemoteUserStoreData)
    {
        if (senderId === undefined)
            return Promise.resolve(this.puppet.getClient());
        else if (senderId in config.users)
        {
            const user = config.users[senderId];
            return Promise.resolve(user.mxclient.getClient());
        }
        else
            return super.getUserClient(roomId, senderId, senderName, avatarUrl,
                                       doNotTryToGetRemoteUserStoreData);
    }

    // Override to make msgtype settable and get correct client
    handleThirdPartyRoomMessage(thirdPartyRoomMessageData)
    {
        console.log('handling third party room message',
                    thirdPartyRoomMessageData);
        let
        {
            roomId,
            senderName,
            senderId,
            receiverId,
            avatarUrl,
            text,
            html,
            msgtype
        } = thirdPartyRoomMessageData;

        msgtype = msgtype || "m.txt";

        let puppet = this.getMultiUserPuppet(receiverId);
        console.log(`puppet: ${puppet}`);
        return this.getOrCreateMatrixRoomFromThirdPartyRoomId(roomId, puppet).then((matrixRoomId) => {
            return this.getUserClient(matrixRoomId, senderId, senderName, avatarUrl).then((client) => {
                if (senderId === undefined) {
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
    handleMatrixMessageEvent(data)
    {
        const { room_id, content: { body, msgtype } } = data;
        const thirdPartyRoomId = this.getThirdPartyRoomIdFromMatrixRoomId(room_id);
        const isStatusRoom = thirdPartyRoomId === this.getStatusRoomPostfix();

        if (!thirdPartyRoomId)
            return;
        else if (isStatusRoom)
        {
            // Sometimes the base class sends a warning which can trigger a
            // message loop. so just don't do that nonsense.
            return;
        }
        else
        {
            if (msgtype === 'm.emote')
            {
                let msg = this.tagMatrixMessage(body);
                let promise = () =>
                    this.sendEmoteAsPuppetToThirdPartyRoomWithId(
                        thirdPartyRoomId, msg, data);
                return promise().catch(err=>{
                    this.sendStatusMsg(
                        {}, 'Error in '+this.handleMatrixEvent.name, err, data);
                });
            }
        }
        return super.handleMatrixMessageEvent(data);
    }

    // override to choose the correct puppet
    getOrCreateMatrixRoomFromThirdPartyRoomId(thirdPartyRoomId, puppet) {
        const warn = console.log;
        const info = console.log;
        warn(`MY MY MY getOrCreateMatrixRoomFromThirdPartyRoomId: ${thirdPartyRoomId} ${puppet}`);
        const roomAlias = this.getRoomAliasFromThirdPartyRoomId(thirdPartyRoomId);
        const roomAliasName = this.getRoomAliasLocalPartFromThirdPartyRoomId(thirdPartyRoomId);
        info('looking up', thirdPartyRoomId);
        const botIntent = this.getIntentFromApplicationServerBot();
        const botClient = botIntent.getClient();

        if (puppet == null)
            puppet = this.puppet;
        let puppetClient = puppet.getClient();
        const puppetUserId = puppetClient.credentials.userId;
        warn(`puppetUserId: ${puppetUserId}`);

        const grantPuppetMaxPowerLevel = (room_id) => {
            info(`ensuring puppet user has full power over this room: ${puppet.id}`);
            return botIntent.setPowerLevel(room_id, puppetUserId, 100).then(()=>{
                info('granted puppet client admin status on the protocol status room');
            }).catch((err)=>{
                warn(err);
                warn('ignoring failed attempt to give puppet client admin on the status room');
            }).then(()=> {
                return room_id;
            });
        };

        return puppetClient.getRoomIdForAlias(roomAlias).then(({room_id}) => {
            info("found matrix room via alias. room_id:", room_id, puppetClient.credentials.userId);
            return room_id;
        }, (_err) => {
            info("the room doesn't exist. we need to create it for the first time");
            return Promise.resolve(this.getThirdPartyRoomDataById(thirdPartyRoomId)).then(thirdPartyRoomData => {
                info("got 3p room data", thirdPartyRoomData);
                const { name, topic } = thirdPartyRoomData;
                info("creating room !!!!", ">>>>"+roomAliasName+"<<<<", name, topic);
                return botIntent.createRoom({
                    createAsClient: true, // bot won't auto-join the room in this case
                    options: {
                        name, topic, room_alias_name: roomAliasName
                    }
                }).then(({room_id}) => {
                    info("room created", room_id, roomAliasName);
                    return room_id;
                });
            });
        }).then(matrixRoomId => {
            info("making puppet join room", matrixRoomId);
            return puppetClient.joinRoom(matrixRoomId).then(()=>{
                info("returning room id after join room attempt", matrixRoomId);
                return grantPuppetMaxPowerLevel(matrixRoomId);
            }, (err) => {
                if ( err.message === 'No known servers' ) {
                    warn('we cannot use this room anymore because you cannot currently rejoin an empty room (synapse limitation? riot throws this error too). we need to de-alias it now so a new room gets created that we can actually use.');
                    return botClient.deleteAlias(roomAlias).then(()=>{
                        warn('deleted alias... trying again to get or create room.');
                        return this.getOrCreateMatrixRoomFromThirdPartyRoomId(thirdPartyRoomId, puppetClient);
                    });
                } else {
                    warn("ignoring error from puppet join room: ", err.message);
                    return matrixRoomId;
                }
            });
        }).then(matrixRoomId => {
            puppet.saveThirdPartyRoomId(matrixRoomId, thirdPartyRoomId);
            return matrixRoomId;
        });
    }

    getThirdPartyRoomDataById(id)
    {
        debugVerbose("getThirdPartyRoomDataById()", id)
        let roomData =
            {
                name: id,
                topic: `${config.serviceName} Chat`
            };
        return roomData;
    }

    sendMessageAsPuppetToThirdPartyRoomWithId(id, text, data)
    {
        return this.mudctlr.sendToMud(id, text, data);
    }

    sendEmoteAsPuppetToThirdPartyRoomWithId(id, text, data)
    {
        return this.mudctlr.sendEmoteToMud(id, text, data);
    }

    sendImageMessageAsPuppetToThirdPartyRoomWithId(_thirdPartyRoomId, _data,
                                                   _matrixEvent)
    {
        // TODO:
        console.log("sendImageMessageAsPuppetToThirdPartyRoomWithId: Generate url to send to MUD?");
        return Promise.resolve(true);
    }

    sendFileMessageAsPuppetToThirdPartyRoomWithId(_thirdPartyRoomId, _data,
                                                  _matrixEvent)
    {
        // TODO:
        console.log("sendFileMessageAsPuppetToThirdPartyRoomWithId: Generate url to send to MUD?");
        return Promise.resolve(true);
    }

    sendReadReceiptAsPuppetToThirdPartyRoomWithId(_thirdPartyRoomId)
    {
        // no op for a MUD
        return Promise.resolve(true);
    }
}

const mainUname = config.bridge.puppet;
const mainUser = config.users.find(user => user.mud.username == mainUname)
const mainPuppet = new MUDPuppet(path.join(__dirname, './config.json' ),
                                 config, mainUser ? mainUser.puppet : null);
if (mainUser)
    mainUser.mxclient = mainPuppet;

new Cli({
    port: config.port,
    registrationPath: config.registrationPath,
    generateRegistration: function(reg, callback)
    {
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
    run: function(port)
    {
        // Login users
        for (let index in config.users)
        {
            let user = config.users[index]
            if (user.mud.username == mainUname)
                continue;
            console.log(`Logging ${user.mud.username} into Matrix...`);
            user.mxclient = new MUDPuppet(path.join(__dirname, './config.json' ),
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
