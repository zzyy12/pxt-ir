//% weight=0 color=#87bc4b icon="\uf1eb" block="InfraRed"
namespace IR {

    export enum Ports {
        P0 = 0,
        P1 = 1,
        P2 = 2,
        P8 = 3,
        P12 = 4,
        P16 = 5

    }

    const PortAnalog = [
        AnalogPin.P0,
        AnalogPin.P1,
        AnalogPin.P2,
        AnalogPin.P8,
        AnalogPin.P12,
        AnalogPin.P16
    ]



    export enum encodingType {
        //% block="NEC"
        NEC

    }

    let tempHandler: Action;
    let irLed = AnalogPin.P16;
    const pwmPeriod = 26;
    pins.analogWritePin(irLed, 0);
    pins.analogSetPeriod(irLed, pwmPeriod);
    let send_init = false;
    let rec_init = false;
    let arr: number[] = []
    let received = false
    let first = true
    let rec_Type = ""
    let messageStr = ""
    let command1 =0
    let recPin = DigitalPin.P8
    let thereIsHandler = false
    arr = []

    function transmitBit(highTime: number, lowTime: number): void {
        pins.analogWritePin(irLed, 512);
        control.waitMicros(highTime);
        pins.analogWritePin(irLed, 0);
        control.waitMicros(lowTime);
    }



    /**
     *  set the IR receiver pin.
     */
    //% blockId=setREC_pin block="set IR receiver pin: %myPin" blockExternalInputs=false
    //% weight=85 blockGap=10
    //% myPin.fieldEditor="gridpicker" myPin.fieldOptions.columns=4
    //% myPin.fieldOptions.tooltips="false" myPin.fieldOptions.width="300"
    export function setREC_pin(myPin: DigitalPin) {
        recPin = myPin;
        pins.setEvents(recPin, PinEventType.Pulse)
        pins.setPull(recPin, PinPullMode.PullUp)
        pins.onPulsed(recPin, PulseValue.Low, function () {
            arr.push(input.runningTimeMicros())
        })
        pins.onPulsed(recPin, PulseValue.High, function () {
            arr.push(input.runningTimeMicros())
        })
        control.onEvent(recPin, DAL.MICROBIT_PIN_EVENT_ON_TOUCH, tempHandler);
        rec_init = true;
    }

    /**
     * send message from IR LED. You must set the message encoding type, send how many times, and the message.
     */
    //% blockId=sendMyMessage1 block="send message: %msg| ,%times| times, encoding pin:%port"
    //% weight=80 blockGap=10
    export function sendMyMessage1(msg: number, times: number, port: Ports): void {

        let portss = PortAnalog[port]
        irLed = portss;
        pins.analogWritePin(irLed, 0);
        pins.analogSetPeriod(irLed, pwmPeriod);
        send_init = true;
        if (send_init) {
            //control.inBackground(() => {
            sendMessage(msg, times, encodingType.NEC);
            //})
        }
    }


    function encode(myCode: number, bits: number, trueHigh: number, trueLow: number, falseHigh: number, falseLow: number): void {
        const MESSAGE_BITS = bits;
        for (let mask = 1 << (MESSAGE_BITS - 1); mask > 0; mask >>= 1) {
            if (myCode & mask) {
                transmitBit(trueHigh, trueLow);
            } else {
                transmitBit(falseHigh, falseLow);
            }
        }
    }

    function sendNEC(message: number, times: number): void {
        const enum NEC {
            startHigh = 9000,
            startLow = 4500,
            stopHigh = 560,
            stopLow = 0,
            trueHigh = 560,
            trueLow = 1690,
            falseHigh = 560,
            falseLow = 560,
            interval = 110000
        }
        let address = message >> 16;
        let command = message % 0x010000;
        const MESSAGE_BITS = 16;
        let startTime = 0;
        let betweenTime = 0;
        for (let sendCount = 0; sendCount < times; sendCount++) {
            startTime = input.runningTimeMicros();
            transmitBit(NEC.startHigh, NEC.startLow);
            encode(address, 16, NEC.trueHigh, NEC.trueLow, NEC.falseHigh, NEC.falseLow);
            encode(command, 16, NEC.trueHigh, NEC.trueLow, NEC.falseHigh, NEC.falseLow);
            transmitBit(NEC.stopHigh, NEC.stopLow);
            betweenTime = input.runningTimeMicros() - startTime
            if (times > 0)
                control.waitMicros(NEC.interval - betweenTime);
        }
    }


    export function sendMessage(message: number, times: number, myType: encodingType): void {
        switch (myType) {
            case encodingType.NEC: sendNEC(message, times);

            default: sendNEC(message, times);
        }
    }


    //------------------receiver-------------

    function resetReceiver() {
        arr = []
        received = false
    }

    control.inBackground(function () {
        basic.forever(function () {
            if ((!received) && (rec_init)) {
                if (arr.length > 20) {
                    if ((input.runningTimeMicros() - arr[arr.length - 1]) > 120000) {
                        if (first) {
                            resetReceiver()
                            first = false
                        } else {
                            received = true
                            decodeIR();
                        }
                    }
                }
            }
        })
    })

    function decodeIR() {
        let addr = 0
        let command = 0
        let command1 = 0
        messageStr = ""
        rec_Type = ""
        for (let i = 0; i <= arr.length - 1 - 1; i++) {
            arr[i] = arr[i + 1] - arr[i]
        }
        if (((arr[0] + arr[1]) > 13000) && ((arr[0] + arr[1]) < 14000)) {
            rec_Type = "NEC"
            arr.removeAt(1)
            arr.removeAt(0)
            addr = pulseToDigit(0, 15, 1600)
            command = pulseToDigit(16, 31, 1600)
            command1 = command & 0x00ff

            arr = [];
            if (thereIsHandler) {
                tempHandler();
            }
        } else if (((arr[0] + arr[1]) > 2600) && ((arr[0] + arr[1]) < 3200)) {
            rec_Type = "SONY"
            arr.removeAt(1)
            arr.removeAt(0)
            command = pulseToDigit(0, 11, 1300)
            command1 = command & 0x00ff
            arr = [];
            if (thereIsHandler) {
                tempHandler();
            }
        }
        resetReceiver();
    }

    function pulseToDigit(beginBit: number, endBit: number, duration: number): number {
        let myNum = 0
        for (let i = beginBit; i <= endBit; i++) {
            myNum <<= 1
            if ((arr[i * 2] + arr[i * 2 + 1]) < duration) {
                myNum += 0
            } else {
                myNum += 1
            }
        }
        return myNum
    }



    /**
     * Do something when a receive IR
     */
    //% blockId=onReceivedIR block="on IR message received" blockInlineInputs=true
    //% weight=70 blockGap=10
    export function onReceivedIR(handler: Action): void {
        tempHandler = handler
        thereIsHandler = true
    }

    /**
     * return the message of the received IR 
     */
    //% blockId=getMessage block="the received IR message"
    //% weight=60 blockGap=10
    export function getMessage(): number {
        return command1
    }

}
