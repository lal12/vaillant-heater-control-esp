import Serialport from 'serialport';
import { Vaillant, addresses, buildPacket } from './vaillant.mjs';
import * as FS from 'fs';
import * as MQTT from 'mqtt';
import express from 'express';
import { isDeepStrictEqual } from 'util';
import EventEmitter from 'events';

function startWeb(){
    const app = express();
    app.get('/json', (req,res)=>{
        res.sendFile('./log.json', {root: process.cwd(), type: 'application/stream+json'});
    })
    app.get('/vals', (req,res)=>{
        res.send(addresses.map(ai=>({id: ai.addr, name: ai.name, count: ai.return.length})));
    })
    app.get('/', (req,res)=>res.sendFile('./index.html', {root: process.cwd()}))

    app.listen(8080)
}

function initMqtt(){
    const mqtt = MQTT.connect('mqtt://10.0.0.163:1883', {
        username: 'mqtt',
        password: 'CnUm4ZVxng5Lx43f'
    });
    mqtt.on('error', (err)=>{
        console.error('mqtt err', err);
        //mqtt.end()
    });
    /*mqtt.on('disconnect', ()=>{
        console.warn('mqtt disconnected, reconnecting...');
        mqtt.reconnect()
    });
    mqtt.on('close', ()=>{
        console.warn('mqtt closed, reconnecting...');
        mqtt.reconnect()
    })
    mqtt.on('end', ()=>{
        console.warn('mqtt end, reconnecting...');
        mqtt.reconnect()
    })
    mqtt.on('connect', ()=>{
        console.log('mqtt connected');
    })*/
    const prefix = 'vaillant_atmotec';

    const device = {
        identifiers: 'vaillant_atmotec_stock1',
        manufacturer: 'Vaillant',
        model: 'AtmoTec',
        name: 'Vaillant Heizung',
    }
    const calcCacheTime = (ival)=>Math.min(ival*4, 120);
    const common = {
        expire_after: 10,
        device,
        state_class: 'measurement'
    }
    const discover = {
        [`sensor/${prefix}/ruecklauftemp`]: {
            state_topic: prefix+'/0x98',
            name: device.name+' '+'Rücklauftemperatur',
            icon: 'mdi:coolant-temperature',
            device_class: 'temperature',
            unique_id: prefix+'.ruecklauftemp',
            unit_of_measurement: '°C',
            value_template: '{{value_json[0]}}',
            ...common
        },
        [`sensor/${prefix}/vorlauftemp`]: {
            state_topic: prefix+'/0x18',
            name: device.name+' '+'Vorlauftemperatur',
            icon: 'mdi:coolant-temperature',
            device_class: 'temperature',
            unique_id: prefix+'.vorlauftemp',
            unit_of_measurement: '°C',
            value_template: '{{value_json[0]}}',
            ...common
        },
        [`sensor/${prefix}/aussentemp`]: {
            state_topic: prefix+'/0x6a',
            name: device.name+' '+'Außentemperatur',
            device_class: 'temperature',
            icon: 'mdi:sun-thermometer',
            unique_id: prefix+'.aussentemp',
            unit_of_measurement: '°C',
            value_template: '{{value_json[0]}}',
            ...common
        },
        [`sensor/${prefix}/soll_vorlauf_789`]: {
            state_topic: prefix+'/0x25',
            icon: 'mdi:thermostat-box',
            name: device.name+' '+'Sollwert Vorlauftemperatur Regler',
            device_class: 'temperature',
            unique_id: prefix+'.soll_vorlauf_789',
            unit_of_measurement: '°C',
            ...common
        },
        /*[`number/${prefix}/soll_vorlauf_789`]: {
            state_topic: prefix+'/0x25',
            icon: 'mdi:thermostat-box',
            name: device.name+' '+'Vorlauftemperatur Regler',
            device_class: 'temperature',
            unique_id: prefix+'.soll_vorlauf_regler',
            unit_of_measurement: '°C',
            max: 80,
            min: 20,
            step: 1,
            command_topic: prefix+'/soll_vorlauf_789',
            ...common
        },*/
        [`sensor/${prefix}/soll_vorlauf`]: {
            state_topic: prefix+'/0x39',
            icon: 'mdi:coolant-temperature',
            name: device.name+' '+'Sollwert Vorlauftemperatur',
            device_class: 'temperature',
            unique_id: prefix+'.soll_vorlauf',
            unit_of_measurement: '°C',
            ...common
        },
        [`binary_sensor/${prefix}/aktiv`]: { // sommer/winter
            state_topic: prefix+'/0x08',
            name: device.name+' '+'Heizmodus aktiv',
            device_class: 'heat',
            payload_on: 1,
            payload_off: 0,
            unique_id: prefix+'.aktiv',
            ...common
        },
        [`binary_sensor/${prefix}/raumthermostat`]: {
            state_topic: prefix+'/0x0e',
            name: device.name+' '+'Raumthermostat aktiv',
            icon: 'mdi:home-thermometer',
            device,
            payload_on: 1,
            payload_off: 0,
            state_class: 'measurement',
            unique_id: prefix+'.raumthermostat',
        },
        [`sensor/${prefix}/brenner_sperrzeit`]: {
            state_topic: prefix+'/0x38',
            icon: 'mdi:timelapse',
            name: device.name+' '+'Verbleibende Brennersperrzeit',
            unique_id: prefix+'.brenner_sperrzeit',
            ...common
        },
        [`sensor/${prefix}/heizungsteillast`]: { // TODO einstellbarer wert statt reiner sensor
            state_topic: prefix+'/0x6c',
            name: device.name+' '+'Heizungsteillast',
            unique_id: prefix+'.heizungsteillast',
            ...common
        },
        [`binary_sensor/${prefix}/ext_pumpe`]: {
            state_topic: prefix+'/0x3f',
            name: device.name+' '+'Status externe Heizungspumpe',
            icon: 'mdi:pump',
            payload_on: 1,
            payload_off: 0,
            unique_id: prefix+'.ext_pumpe',
            ...common
        },
        [`binary_sensor/${prefix}/gasventil`]: {
            state_topic: prefix+'/0x48',
            icon: 'mdi:pipe-valve',
            name: device.name+' '+'Status Gasmagnetventil',
            payload_on: 0x0f,
            payload_off: 0xf0,
            unique_id: prefix+'.gasventil',
            ...common
        },
        [`binary_sensor/${prefix}/zuender`]: {
            state_topic: prefix+'/0x49',
            name: device.name+' '+'Status Zünder',
            payload_on: 0x0f,
            payload_off: 0xf0,
            icon: 'mdi:fire',
            unique_id: prefix+'.zuender',
            ...common
        },
    }

    for(const t in discover){
        if(discover[t].state_topic && discover[t].state_topic.slice(-4).startsWith('0x')){
            const addr = parseInt(discover[t].state_topic.slice(-4), 16);
            const ai = addresses.find(a=>a.addr == addr);
            discover[t].expire_after = calcCacheTime(ai.ival)*1.2;
        }
        mqtt.publish('homeassistant/'+t+'/config', JSON.stringify(discover[t]))
    }

    /*mqtt.subscribe(prefix+'/soll_vorlauf_789');
    mqtt.on('message', (topic, message)=>{
        if(topic == prefix+'/soll_vorlauf_789'){
            console.log(parseFloat(message.toString()));
            setFlowTemperature(parseFloat(message.toString()));
        }
    })*/

    const cache = new Map();
    return new class{
        entry(ai, val){
            const multi = ai.return.length > 1;
            const now = Date.now()/1000;
            const topic = '0x'+ai.addr.toString(16).padStart(2,'0')
            const cached = cache.get(topic);
            const cacheTime = calcCacheTime(ai.ival);
            if(cached && now-cached.time < cacheTime && isDeepStrictEqual(cached.val, val)){
                return;
            }
            cache.set(topic, {val, time: now});
            mqtt.publish(prefix+'/'+topic, JSON.stringify(multi ? val : val[0]), { properties: {
                userProperties: {
                    'name': ai.name,
                    'time': now
                },
                payloadFormatIndicator: true,
                contentType: 'application/json'
            }});
        }
    }
}

function initJsonLog(){
    return new class{
        jsonl = FS.createWriteStream('log.json', {flags: 'a'});
        data = new Map();
        entry(ai, val){
            data.set(ai.addr, val);
        }
        //TODO
        cycleDone(){
            const obj = Object.fromEntries(data.entries());
            obj.time = (new Date).toISOString();
            jsonl.write(JSON.stringify(obj)+'\n');
            data.clear();
        }
    }
}

function initConsole(heater){
    return new class{
        entry(ai, v){
            console.log(ai.name || 'Unbekannt 0x'+ai.addr.toString(16), ':', ...heater.convData(ai, v))
        }
    }
}

async function findUnknownVals(v){
    for(let i=0;i<0xff;i++){
        if(addresses.some(ai=>ai.addr == i))
            continue;
        while(true){
            try{
                const pkt = await v.reqAndAnswer(buildPacket(0, Buffer.from([0,0,i,1])));
                if(pkt !== null){
                    let ret = '';
                    const datalen = pkt.len - 3;
                    switch(datalen){
                        case 1: {
                            const b = pkt.data.readUInt8(0);
                            if(b == 0)
                                ret = ['u8'];
                            else if(b == 0xf0 || b == 0x0f)
                                ret = ['state'];
                            else
                                ret = ['analog1'];
                        }break;
                        case 2: 
                            ret = ['analog2'];
                        break;
                        case 4:
                            ret = ['analog2', 'analog2'];
                        break;
                        case 5:
                            ret = ['analog2', 'analog2', 'constate'];
                        break;
                        default:
                            console.warn('unhandled len', datalen);
                    }
                    console.log(`{addr: 0x${i.toString(16)}, return: ${JSON.stringify(ret)}},`);

                    break;
                }
            }catch(e){
                if(e.message == 'not supported!')
                    break;
                if(e.message != 'recv timeout')
                    console.log(e);
            }
        }
    }
    console.log('findUnknownVals done!');
}

class Storage extends EventEmitter{
    updated = new Map();
    addresses = new Map();
    register(ai){
        this.addresses.set(ai.addr, ai);
    }
    updateVal(addr, val){
        const ai = this.addresses.get(addr);
        if(!ai)
            throw new Error('unknown addr '+addr);
        this.emit('updated', ai, val);
        this.updated.set(addr, Date.now())
    }
    nextRead(){
        const now = Date.now();
        const ordered = Array.from(this.addresses.values()).map(ai=>{
            const last = this.updated.get(ai.addr);
            return [ai, ai.ival - now + (last || 0)]
        }).sort((a,b)=>a[1]-b[1]);
        return ordered[0][0];
    }
};

async function main(){
    const ser = new Serialport('/dev/ttyUSB0', {
        baudRate: 9600,
        dataBits: 8,
        parity: 'none',
        stopBits: 1
    });
    /*await new Promise(res=>ser.on('open', res));
	ser.on('data', d=>{
		if(d.equals(Buffer.from('070000009800c9', 'hex'))){
			console.log(d.toString('hex'))
			ser.write(Buffer.from('04001200', 'hex'));
}else{
	console.log('not eq', d, Buffer.from('070000009800c9', 'hex'));
}
   });
//setInterval(()=>ser.write(Buffer.from('abcdef')), 1000);
return;*/    
const v = new Vaillant(ser);
    const handlers = [
        initMqtt(v),
        initJsonLog(v),
        initConsole(v)
    ];
    startWeb();

    //findUnknownVals(v);

    const st = new Storage();
    for(const ai of addresses){
        st.register(ai);
    }

    for(const h of handlers){
        st.on('updated', (a,v)=>h.entry(a,v));
    }

let lastread = Date.now();
setInterval(()=>{
const diff = Date.now() - lastread;
if(diff > 10000){
console.log('no new val for '+Math.round(diff/1e3)+'s');
}
}, 10000);
    while(true){
        const ai = st.nextRead();
        try{
            const data = await v.reqAddr(ai);
            if(data){
                st.updateVal(ai.addr, data);
		lastread = Date.now();
            }else{
                console.log('null val for', ai)
            }
        }catch(e){
            if(e.message != 'recv timeout')
                console.error(e, ai);
        }
    }    
}

import * as child_process from 'child_process';

function execShellCommand(cmd) {
    const exec = child_process.exec;
    return new Promise((resolve, reject) => {
     exec(cmd, (error, stdout, stderr) => {
      if (error) {
       console.warn(error);
      }
      resolve(stdout? stdout : stderr);
     });
    });
}

// for 1kHz
const points = [
    [10, 43.13],
    [23, 39.22],
    [30.2, 35.3],
    [37.9, 31.37],
    [46.6, 27.45],
    [54.4, 23.52],
    [65, 19.6],
    [74.3, 15.69],
    [86, 11.76]
]

function getDutyCycleForTemp(temp){
    const larger = points.findIndex(([t, dc])=>t>temp);
    if(larger <= 0)
        throw new Error('Error failed to calculate dutyCycle for '+temp+'!');
    const [t0, dc0] = points[larger-1];
    const [t1, dc1] = points[larger];
    const tPart = (temp-t0)/(t1-t0);
    const dutyCycle = dc0+(dc1-dc0)*tPart;
    return dutyCycle;
}
function setFlowTemperature(tempP){
    const gpio = 23;
    const freq = 1e3; // 40kHz
    const temp = Math.min(Math.max(20, tempP), tempP, 80);
    if(temp != tempP){
        console.warn('Setting temp to '+tempP+' °C is not allowed, will be set to '+temp+' °C instead.');
    }
    const dutyCycle = getDutyCycleForTemp(temp);
    console.log(temp, dutyCycle);
    execShellCommand('pigs pfs '+gpio+' '+freq); // set pwm frequency to be sure
    execShellCommand('pigs p '+gpio+' '+Math.round(dutyCycle*255/100));
    console.log('pigs p '+gpio+' '+Math.round(dutyCycle*255/100))
}
//setFlowTemperature(62);

main();
