const protooServer = require('protoo-server');
const config = require("./config");

class Room extends protooServer.Room {
    static async create(mediasoupWorker) {
        let { mediaCodecs } = config.mediasoup.routerOptions;

        const mediasoupRouter = await mediasoupWorker.createRouter({ mediaCodecs });

        const audioLevelObserver = await mediasoupRouter.createAudioLevelObserver(
            {
                maxEntries: 1,
                threshold: -80,
                interval: 800
            });

        return new Room(mediasoupWorker, mediasoupRouter, audioLevelObserver);
    }

    constructor(mediasoupWorker, mediasoupRouter, audioLevelObserver) {
        super();

        this.mediasoupWorker = mediasoupWorker;
        this.mediasoupRouter = mediasoupRouter;
        this.audioLevelObserver = audioLevelObserver;

        this.handleAudioLevelObserver();
    }

    close() {
        super.close();

        this.mediasoupRouter.close();

    }

    getJoinedPeers(predicate = peer => true) {
        return this.peers
            .filter((peer) => peer.data.joined && predicate(peer));
    }

    handleConnection(peer) {
        peer.data.transports = new Map();
        peer.data.producers = new Map();
        peer.data.consumers = new Map();
        peer.data.dataProducers = new Map();
        peer.data.dataConsumers = new Map();

        peer.on('request', (request, accept, reject) => {
            logger.info(
                'protoo Peer "request" event [method:%s, peerId:%s]',
                request.method, peer.id);

            this.handleRequest(peer, request, accept, reject).catch(err => {
                reject(err);
            });
        });

        peer.on('close', () => {
            logger.debug('protoo Peer "close" event [peerId:%s]', peer.id);

            // If the Peer was joined, notify all Peers.
            if (peer.data.joined) {
                for (const otherPeer of this.getJoinedPeers(joinedPeer => joinedPeer !== peer)) {
                    otherPeer.notify('peerClosed', { peerId: peer.id })
                        .catch(() => { });
                }
            }

            // Iterate and close all mediasoup Transport associated to this Peer, so all
            // its Producers and Consumers will also be closed.
            for (const transport of peer.data.transports.values()) {
                transport.close();
            }

            // If this is the latest Peer in the room, close the room.
            if (this.peers.length === 0) {

                this.close();
            }
        });
    }

    /**
 * Creates a mediasoup Consumer for the given mediasoup Producer.
 *
 * @async
 */
    async createConsumer({ consumerPeer, producerPeer, producer }) {
        // Optimization:
        // - Create the server-side Consumer in paused mode.
        // - Tell its Peer about it and wait for its response.
        // - Upon receipt of the response, resume the server-side Consumer.
        // - If video, this will mean a single key frame requested by the
        //   server-side Consumer (when resuming it).
        // - If audio (or video), it will avoid that RTP packets are received by the
        //   remote endpoint *before* the Consumer is locally created in the endpoint
        //   (and before the local SDP O/A procedure ends). If that happens (RTP
        //   packets are received before the SDP O/A is done) the PeerConnection may
        //   fail to associate the RTP stream.

        // NOTE: Don't create the Consumer if the remote Peer cannot consume it.
        if (
            !consumerPeer.data.rtpCapabilities ||
            !this.mediasoupRouter.canConsume(
                {
                    producerId: producer.id,
                    rtpCapabilities: consumerPeer.data.rtpCapabilities
                })
        ) {
            return;
        }

        // Must take the Transport the remote Peer is using for consuming.
        const transport = Array.from(consumerPeer.data.transports.values())
            .find((t) => t.appData.consuming);

        // This should not happen.
        if (!transport) {
            logger.warn('_createConsumer() | Transport for consuming not found');

            return;
        }

        // Create the Consumer in paused mode.
        let consumer;

        try {
            consumer = await transport.consume(
                {
                    producerId: producer.id,
                    rtpCapabilities: consumerPeer.data.rtpCapabilities,
                    paused: true
                });
        }
        catch (error) {
            logger.warn('_createConsumer() | transport.consume():%o', error);

            return;
        }

        // Store the Consumer into the protoo consumerPeer data Object.
        consumerPeer.data.consumers.set(consumer.id, consumer);

        // Set Consumer events.
        consumer.on('transportclose', () => {
            // Remove from its map.
            consumerPeer.data.consumers.delete(consumer.id);
        });

        consumer.on('producerclose', () => {
            // Remove from its map.
            consumerPeer.data.consumers.delete(consumer.id);

            consumerPeer.notify('consumerClosed', { consumerId: consumer.id })
                .catch(() => { });
        });

        consumer.on('producerpause', () => {
            consumerPeer.notify('consumerPaused', { consumerId: consumer.id })
                .catch(() => { });
        });

        consumer.on('producerresume', () => {
            consumerPeer.notify('consumerResumed', { consumerId: consumer.id })
                .catch(() => { });
        });

        consumer.on('score', (score) => {
            // logger.debug(
            // 	'consumer "score" event [consumerId:%s, score:%o]',
            // 	consumer.id, score);

            consumerPeer.notify('consumerScore', { consumerId: consumer.id, score })
                .catch(() => { });
        });

        consumer.on('layerschange', (layers) => {
            consumerPeer.notify(
                'consumerLayersChanged',
                {
                    consumerId: consumer.id,
                    spatialLayer: layers ? layers.spatialLayer : null,
                    temporalLayer: layers ? layers.temporalLayer : null
                })
                .catch(() => { });
        });

        // NOTE: For testing.
        // await consumer.enableTraceEvent([ 'rtp', 'keyframe', 'nack', 'pli', 'fir' ]);
        // await consumer.enableTraceEvent([ 'pli', 'fir' ]);
        // await consumer.enableTraceEvent([ 'keyframe' ]);

        consumer.on('trace', (trace) => {
            logger.info(
                'consumer "trace" event [producerId:%s, trace.type:%s, trace:%o]',
                consumer.id, trace.type, trace);
        });

        // Send a protoo request to the remote Peer with Consumer parameters.
        try {
            await consumerPeer.request(
                'newConsumer',
                {
                    peerId: producerPeer.id,
                    producerId: producer.id,
                    id: consumer.id,
                    kind: consumer.kind,
                    rtpParameters: consumer.rtpParameters,
                    type: consumer.type,
                    appData: producer.appData,
                    producerPaused: consumer.producerPaused
                });

            // Now that we got the positive response from the remote endpoint, resume
            // the Consumer so the remote endpoint will receive the a first RTP packet
            // of this new stream once its PeerConnection is already ready to process
            // and associate it.
            await consumer.resume();

            consumerPeer.notify(
                'consumerScore',
                {
                    consumerId: consumer.id,
                    score: consumer.score
                })
                .catch(() => { });
        }
        catch (error) {
            logger.warn('createConsumer() | failed:%o', error);
        }
    }

    async handleRequest(peer, request, accept, reject) {
        switch (request.method) {
            case "getRouterRtpCapabilities":
                accept(this.mediasoupRouter.rtpCapabilities);
                break;
            case "join":
                {
                    if (peer.data.joined)
                        throw new Error('Peer already joined');


                    const {
                        displayName,
                        device,
                        rtpCapabilities,
                        sctpCapabilities
                    } = request.data;


                    // Store client data into the protoo Peer data object.
                    peer.data.joined = true;
                    peer.data.displayName = displayName;
                    peer.data.device = device;
                    peer.data.rtpCapabilities = rtpCapabilities;
                    peer.data.sctpCapabilities = sctpCapabilities;

                    const peerInfos = this.getJoinedPeers((joinedPeer) => joinedPeer.id !== peer.id)
                        .map((joinedPeer) => ({
                            id: joinedPeer.id,
                            displayName: joinedPeer.data.displayName,
                            device: joinedPeer.data.device
                        }));

                    accept({ peers: peerInfos });

                    peer.data.joined = true;

                    for (const joinedPeer of this.getJoinedPeers()) {
                        // Create Consumers for existing Producers.
                        for (const producer of joinedPeer.data.producers.values()) {
                            this.createConsumer(
                                {
                                    consumerPeer: peer,
                                    producerPeer: joinedPeer,
                                    producer
                                });
                        }
                    }
                }
                break;
            case "createWebRtcTransport":
                {
                    // NOTE: Don't require that the Peer is joined here, so the client can
                    // initiate mediasoup Transports and be ready when he later joins.

                    const {
                        forceTcp,
                        producing,
                        consuming,
                        sctpCapabilities
                    } = request.data;

                    const webRtcTransportOptions =
                    {
                        ...config.mediasoup.webRtcTransportOptions,
                        enableSctp: Boolean(sctpCapabilities),
                        numSctpStreams: (sctpCapabilities || {}).numStreams,
                        appData: { producing, consuming }
                    };

                    if (forceTcp) {
                        webRtcTransportOptions.enableUdp = false;
                        webRtcTransportOptions.enableTcp = true;
                    }

                    const transport = await this.mediasoupRouter.createWebRtcTransport(
                        webRtcTransportOptions);

                    transport.on('sctpstatechange', (sctpState) => {
                        logger.debug('WebRtcTransport "sctpstatechange" event [sctpState:%s]', sctpState);
                    });

                    transport.on('dtlsstatechange', (dtlsState) => {
                        if (dtlsState === 'failed' || dtlsState === 'closed')
                            logger.warn('WebRtcTransport "dtlsstatechange" event [dtlsState:%s]', dtlsState);
                    });

                    // NOTE: For testing.
                    // await transport.enableTraceEvent([ 'probation', 'bwe' ]);
                    // await transport.enableTraceEvent([ 'bwe' ]);

                    transport.on('trace', (trace) => {
                        logger.info(
                            'transport "trace" event [transportId:%s, trace.type:%s, trace:%o]',
                            transport.id, trace.type, trace);
                    });

                    // Store the WebRtcTransport into the protoo Peer data Object.
                    peer.data.transports.set(transport.id, transport);

                    accept(
                        {
                            id: transport.id,
                            iceParameters: transport.iceParameters,
                            iceCandidates: transport.iceCandidates,
                            dtlsParameters: transport.dtlsParameters,
                            sctpParameters: transport.sctpParameters
                        });

                    const { maxIncomingBitrate } = config.mediasoup.webRtcTransportOptions;

                    // If set, apply max incoming bitrate limit.
                    if (maxIncomingBitrate) {
                        try { await transport.setMaxIncomingBitrate(maxIncomingBitrate); }
                        catch (error) { }
                    }
                }
                break;
            case "connectWebRtcTransport":
                {
                    const { transportId, dtlsParameters } = request.data;
                    const transport = peer.data.transports.get(transportId);

                    if (!transport)
                        throw new Error(`transport with id "${transportId}" not found`);

                    await transport.connect({ dtlsParameters });

                    accept();
                }
                break;

            case 'restartIce':
                {
                    const { transportId } = request.data;
                    const transport = peer.data.transports.get(transportId);

                    if (!transport)
                        throw new Error(`transport with id "${transportId}" not found`);

                    const iceParameters = await transport.restartIce();

                    accept(iceParameters);
                }
                break;

            case 'produce':
                {
                    // Ensure the Peer is joined.
                    if (!peer.data.joined)
                        throw new Error('Peer not yet joined');

                    const { transportId, kind, rtpParameters } = request.data;
                    let { appData } = request.data;
                    const transport = peer.data.transports.get(transportId);

                    if (!transport)
                        throw new Error(`transport with id "${transportId}" not found`);

                    // Add peerId into appData to later get the associated Peer during
                    // the 'loudest' event of the audioLevelObserver.
                    appData = { ...appData, peerId: peer.id };

                    const producer = await transport.produce(
                        {
                            kind,
                            rtpParameters,
                            appData
                            // keyFrameRequestDelay: 5000
                        });

                    // Store the Producer into the protoo Peer data Object.
                    peer.data.producers.set(producer.id, producer);

                    // Set Producer events.
                    producer.on('score', (score) => {
                        // logger.debug(
                        // 	'producer "score" event [producerId:%s, score:%o]',
                        // 	producer.id, score);

                        peer.notify('producerScore', { producerId: producer.id, score })
                            .catch(() => { });
                    });

                    producer.on('videoorientationchange', (videoOrientation) => {
                        logger.debug(
                            'producer "videoorientationchange" event [producerId:%s, videoOrientation:%o]',
                            producer.id, videoOrientation);
                    });

                    // NOTE: For testing.
                    // await producer.enableTraceEvent([ 'rtp', 'keyframe', 'nack', 'pli', 'fir' ]);
                    // await producer.enableTraceEvent([ 'pli', 'fir' ]);
                    // await producer.enableTraceEvent([ 'keyframe' ]);

                    producer.on('trace', (trace) => {
                        logger.info(
                            'producer "trace" event [producerId:%s, trace.type:%s, trace:%o]',
                            producer.id, trace.type, trace);
                    });

                    accept({ id: producer.id });

                    // Optimization: Create a server-side Consumer for each Peer.
                    for (const otherPeer of this.getJoinedPeers(joinedPeer => joinedPeer !== peer)) {
                        this.createConsumer(
                            {
                                consumerPeer: otherPeer,
                                producerPeer: peer,
                                producer
                            });
                    }

                    // Add into the audioLevelObserver.
                    if (producer.kind === 'audio') {
                        this.audioLevelObserver.addProducer({ producerId: producer.id })
                            .catch(() => { });
                    }
                }

                break;

            case "closeProducer":
                {
                    // Ensure the Peer is joined.
                    if (!peer.data.joined)
                        throw new Error('Peer not yet joined');

                    const { producerId } = request.data;
                    const producer = peer.data.producers.get(producerId);

                    if (!producer)
                        throw new Error(`producer with id "${producerId}" not found`);

                    producer.close();

                    // Remove from its map.
                    peer.data.producers.delete(producer.id);

                    accept();
                }
                break;

            case 'pauseProducer':
                {
                    // Ensure the Peer is joined.
                    if (!peer.data.joined)
                        throw new Error('Peer not yet joined');

                    const { producerId } = request.data;
                    const producer = peer.data.producers.get(producerId);

                    if (!producer)
                        throw new Error(`producer with id "${producerId}" not found`);

                    await producer.pause();

                    accept();
                }
                break;

            case "resumeProducer":
                {
                    // Ensure the Peer is joined.
                    if (!peer.data.joined)
                        throw new Error('Peer not yet joined');

                    const { producerId } = request.data;
                    const producer = peer.data.producers.get(producerId);

                    if (!producer)
                        throw new Error(`producer with id "${producerId}" not found`);

                    await producer.resume();

                    accept();
                }
                break;

            case "pauseConsumer":
                {
                    // Ensure the Peer is joined.
                    if (!peer.data.joined)
                        throw new Error('Peer not yet joined');

                    const { consumerId } = request.data;
                    const consumer = peer.data.consumers.get(consumerId);

                    if (!consumer)
                        throw new Error(`consumer with id "${consumerId}" not found`);

                    await consumer.pause();

                    accept();
                }

                break;

            case "resumeConsumer":
                {
                    // Ensure the Peer is joined.
                    if (!peer.data.joined)
                        throw new Error('Peer not yet joined');

                    const { consumerId } = request.data;
                    const consumer = peer.data.consumers.get(consumerId);

                    if (!consumer)
                        throw new Error(`consumer with id "${consumerId}" not found`);

                    await consumer.resume();

                    accept();
                }
                break;

            case 'setConsumerPreferredLayers':
                {
                    // Ensure the Peer is joined.
                    if (!peer.data.joined)
                        throw new Error('Peer not yet joined');

                    const { consumerId, spatialLayer, temporalLayer } = request.data;
                    const consumer = peer.data.consumers.get(consumerId);

                    if (!consumer)
                        throw new Error(`consumer with id "${consumerId}" not found`);

                    await consumer.setPreferredLayers({ spatialLayer, temporalLayer });

                    accept();
                }
                break;

            case 'setConsumerPriority':
                {
                    // Ensure the Peer is joined.
                    if (!peer.data.joined)
                        throw new Error('Peer not yet joined');

                    const { consumerId, priority } = request.data;
                    const consumer = peer.data.consumers.get(consumerId);

                    if (!consumer)
                        throw new Error(`consumer with id "${consumerId}" not found`);

                    await consumer.setPriority(priority);

                    accept();
                }
                break;

            case 'requestConsumerKeyFrame':
                {
                    // Ensure the Peer is joined.
                    if (!peer.data.joined)
                        throw new Error('Peer not yet joined');

                    const { consumerId } = request.data;
                    const consumer = peer.data.consumers.get(consumerId);

                    if (!consumer)
                        throw new Error(`consumer with id "${consumerId}" not found`);

                    await consumer.requestKeyFrame();

                    accept();
                }
                break;

            case 'getTransportStats':
                {
                    const { transportId } = request.data;
                    const transport = peer.data.transports.get(transportId);

                    if (!transport)
                        throw new Error(`transport with id "${transportId}" not found`);

                    const stats = await transport.getStats();

                    accept(stats);
                }
                break;

            case 'getProducerStats':
                {
                    const { producerId } = request.data;
                    const producer = peer.data.producers.get(producerId);

                    if (!producer)
                        throw new Error(`producer with id "${producerId}" not found`);

                    const stats = await producer.getStats();

                    accept(stats);
                }
                break;

            case 'getConsumerStats':
                {
                    const { consumerId } = request.data;
                    const consumer = peer.data.consumers.get(consumerId);

                    if (!consumer)
                        throw new Error(`consumer with id "${consumerId}" not found`);

                    const stats = await consumer.getStats();

                    accept(stats);
                }
                break;

            case 'applyNetworkThrottle':
                {
                    const DefaultUplink = 1000000;
                    const DefaultDownlink = 1000000;
                    const DefaultRtt = 0;

                    const { uplink, downlink, rtt, secret } = request.data;

                    if (!secret || secret !== process.env.NETWORK_THROTTLE_SECRET) {
                        reject(403, 'operation NOT allowed, modda fuckaa');

                        return;
                    }

                    try {
                        await throttle.start(
                            {
                                up: uplink || DefaultUplink,
                                down: downlink || DefaultDownlink,
                                rtt: rtt || DefaultRtt
                            });

                        logger.warn(
                            'network throttle set [uplink:%s, downlink:%s, rtt:%s]',
                            uplink || DefaultUplink,
                            downlink || DefaultDownlink,
                            rtt || DefaultRtt);

                        accept();
                    }
                    catch (error) {
                        logger.error('network throttle apply failed: %o', error);

                        reject(500, error.toString());
                    }

                    break;
                }

            case 'resetNetworkThrottle':
                {
                    const { secret } = request.data;

                    if (!secret || secret !== process.env.NETWORK_THROTTLE_SECRET) {
                        reject(403, 'operation NOT allowed, modda fuckaa');

                        return;
                    }

                    try {
                        await throttle.stop({});

                        logger.warn('network throttle stopped');

                        accept();
                    }
                    catch (error) {
                        logger.error('network throttle stop failed: %o', error);

                        reject(500, error.toString());
                    }

                    break;
                }
                default:
                    logger.error('unkown method %s', request.method);
                    break;

        }
    }

    handleAudioLevelObserver() {
        this.audioLevelObserver.on('volumes', (volumes) => {
            const { producer, volume } = volumes[0];

            // logger.debug(
            // 	'audioLevelObserver "volumes" event [producerId:%s, volume:%s]',
            // 	producer.id, volume);

            // Notify all Peers.
            for (const peer of this.getJoinedPeers()) {
                peer.notify(
                    'activeSpeaker',
                    {
                        peerId: producer.appData.peerId,
                        volume: volume
                    })
                    .catch(() => { });
            }
        });

        this.audioLevelObserver.on('silence', () => {
            // logger.debug('audioLevelObserver "silence" event');

            // Notify all Peers.
            for (const peer of this.getJoinedPeers()) {
                peer.notify('activeSpeaker', { peerId: null })
                    .catch(() => { });
            }
        });
    }
}

module.exports = Room;