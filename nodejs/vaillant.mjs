import stream from 'stream';

function calcChecksum(data){
    let chksum = 0;
    for(let i=0;i<data.length;i++){
        if(chksum & 0x80){
            chksum = (chksum << 1 | 1) & 0xFF;
            chksum = chksum ^ 0x18;
        }else{
            chksum = chksum << 1;
        }
        chksum = chksum ^ data.readUInt8(i);
    }
    return chksum;
}

const msgTypes = {
    GET: 0x00,
    SET: 0x80
}

export function buildPacket(type, data){
    const buf = Buffer.alloc(data.length + 3);
    buf.writeUInt8(buf.length, 0); // len byte
    buf.writeUInt8(type, 1);
    data.copy(buf, 2);
    const chksum = calcChecksum(buf.slice(0, -1));
    buf.writeUInt8(chksum, 2+data.length);
    return buf;
}

export function buildGetMsg(addr, expRet = 0){
    return buildPacket(msgTypes.GET, Buffer.from([0,0,addr,expRet]));
}

export function parseMsg(buf){
    const len = buf.readUInt8(0);
    if(buf.length != len)
        return null;
    const type = buf.readUInt8(1);
    if(type != 0){
        if(type == 3 && buf.readUInt8(2) == 5)
            throw new Error('not supported!');
        else
            console.warn('error type', type, buf);
        return null;
    }
    const data = buf.slice(2, len-1);
    const pktchk = buf.readUInt8(len-1);
    const calcchk = calcChecksum(buf.slice(0, -1));
    if(calcchk != pktchk){
        console.warn('checksums did not match!', {pktchk, calcchk, buf});
        return null;
    }
    return {len, type, data};
}

const vals = {
    'analog2': {size: 2, read: (b,o)=>b.readInt16BE(o)/16, conv: v=>v, write: (b,o,v)=>b.writeInt16BE(Math.round(v*16),o)},
    's8': {size: 1, read: (b,o)=>b.readInt8(o), conv: v=>v, write: (b,o,v)=>b.writeInt8(Math.round(v),o)},
    'constate': {size: 1, read: (b,o)=>b.readUInt8(o), conv: v=>{
        switch(v){
            case 0: return 'ok';
            case 0x55: return 'Kurzschluss';
            case 0xaa: return 'Unterbrochen';
            default: return '??: '+(v.toString(16));
        }
    },},
    'state': {size: 1, read: (b,o)=>b.readUInt8(o), conv: v=>{
        switch(v){
            case 0x0f: return 'an';
            case 0xf0: return 'aus';
            default: return '??: '+(v.toString(16));
        }
    },},
    'bool': {size: 1, read: (b,o)=>b.readUInt8(o), conv: v=>v==0?false:v==1?true:'?: '+v},
    'u8': {size: 1, read: (b,o)=>b.readUInt8(o)},
    '8': {size: 8, read: (b,o)=>b.slice(o, o+8).toString('hex')},
    '9': {size: 9, read: (b,o)=>b.slice(o, o+9).toString('hex')},
}

export const addresses = [
    {id: 'ruecklauftemp', name: 'Rücklauftemperatur', return: ['analog2','analog2','constate'], addr: 0x98, ival: 4},
    {id: 'vorlauftemp', name: 'Vorlauftemperatur', return: ['analog2', 'constate'], addr: 0x18, ival: 4},
    {id: 'aussentemp', name: 'Außentemperatur', return: ['analog2', 'constate'], addr: 0x6a, ival: 30},
    {id: 'sommerwinter', name: 'Sommer/Winter', return: ['bool'], addr: 0x08, ival: 30},
    {id: 'gfa_stoer', name: 'Anzahl GFA Störungen', return: ['u8'], addr: 0x1f, ival: 30},
    {id: 'stb_abschal', name: 'Anzahl STB Abschaltungen', return: ['u8'], addr: 0x20, ival: 30},
    {id: 'soll_vorlauf_789', name: 'Sollwert Vorlauf Ext. Regler 7-8-9', return: ['analog2'], addr: 0x25, ival: 10},
    {id: 'soll_vorlauf', name: 'Sollwert Vorlauf', return: ['analog2'], addr: 0x39, ival: 10},
    {id: 'verbl_brennersperrz', name: 'Verbleibende Brennersperrzeit ', return: ['u8'], addr: 0x38, ival: 10},
    {id: 'st_raumtherm', name: 'Status Raumthermostat', return: ['bool'], addr: 0x0e, ival: 30},
    {id: 'korr_aussentemp', name: 'Korrekturwert Aussentemperatur ', return: ['u8'], addr: 0x65, ival: 60},
    {id: 'pumpenachlauf_heizen', name: 'Wasserpumpennachlaufzeit nach Heizbetrieb', return: ['u8'], addr: 0x64, ival: 60},
    {id: 'heizungsteillast', name: 'Heizungsteillast', return: ['u8'], addr: 0x6c, ival: 60},
    {id: 'st_gasventil', name: 'Status Gasmagnetventil', return: ['state'], addr: 0x48, ival: 5},
    {id: 'st_zuender', name: 'Status Zünder', return: ['state'], addr: 0x49, ival: 2},
    {id: 'st_pumpe_ext', name: 'Status externe Heizungspumpe', return: ['u8'], addr: 0x3f, ival: 20},
    //{id: 'drehzahl_soll', name: 'Drehzahlsollwert', return: ['analog2'], addr: 0x24},
    //{id: 'drehzahl_ist', name: 'Drehzahlistwert', return: ['analog2'], addr: 0x83},
    //{addr: 0x01, name: 'Sollwert Brauchwassertemperatur', return: ['analog2']},
    //{addr: 0x04, name: 'Sollwert Speicher', return: ['analog2'], ival: 20},
    {addr: 0x05, name: 'Flammsignal', return: ['state'], ival: 4},
    //{name: 'Brenner aktiv', addr: 0x0D, return: ['state']}, // guessed name, but the values match this assumption
    //{addr: 0x16, name: 'Brauchwassersensor', return: ['analog2', 'constate']}, 
    //{addr: 0x17, name: 'Speichertemperatur', return: ['analog2', 'constate']},
    //{addr: 0x42, name: 'Stellung VUV', return: ['u8']},
    {addr: 0x44, name: 'Status interne Heizungspumpe', return: ['bool'], ival: 20},
    //{addr: 0x58, name: 'Anforderung Warmwasser C1/C2', return: ['bool']},
    //{addr: 0x63, name: 'Wasserpumpennachlaufzeit nach Speicherladung', return: ['s8']},
    //{addr: 0 name: 'Unbekannter Statuswert',x64, name: 'Wasserpumpennachlaufzeit nach Heizbetrieb', return: ['s8']},
    {addr: 0x65, name: 'Korrekturwert Aussentemperatur', return: ['s8'], ival: 60},
    //{addr: 0x66, name: 'Speicherladezeit', return: ['s8']},
    //{addr: 0x6B, name: 'Ext. Vor-/Rücklauftemperatur', return: ['analog2', 'constate']},
    {addr: 0x6F, name: 'Zähler 3 Zündversuche', return: ['s8'], ival: 30},
    //{addr: 0x71, name: 'Status Speicherfreigabe Schaltuhr', return: ['bool']},
    {addr: 0x9D, name: 'Offset Warmstartsollwert', return: ['s8'], ival: 60},
    //{addr: 0x9E, name: 'Status Speicherladepumpe', return: ['bool']},
    {addr: 0xA1, name: 'Sollwert interne Heizungspumpe', return: ['bool'], ival: 30},
    {addr: 0xA5, name: 'Max. Vorlauftemperatur', return: ['s8'], ival: 60},
    //{name: 'Status Zirkulationspumpe', addr: 0xAF, return: ['bool']},
    //{name: 'Status Rücklaufregelung', addr: 0xB3, return: ['bool']}, 

    //{addr: 0x19, name: 'Sollwert Vorlauf ???', return: ['analog2'], ival: 30},
    //{addr: 0x69, return: ['u8'], name: 'Status DCF Signal', ival: 10}, // d.91
/*
    {addr: 0x03, return: ['state']},
    {addr: 0x43, return: ['bool']},
    {addr: 0x45, return: ['bool']},
    {addr: 0x46, return: ['state']},
    {addr: 0x47, return: ['state']},
    {addr: 0x4B, return: ['analog2']},
    {addr: 0x4D, return: ['state']},
    {addr: 0x4E, return: ['state']},
    {addr: 0x4F, return: ['state']},
    {addr: 0x50, return: ['state']},
    {addr: 0x51, return: ['state']},
    {addr: 0x53, return: ['state']},
    {addr: 0x54, return: ['bool']},
    {addr: 0x55, return: ['analog2']},
    {addr: 0x57, return: ['bool']},
    {addr: 0x5B, return: ['bool']},
    {addr: 0x5C, return: ['analog2']},
    {addr: 0x5D, return: ['bool']},
    {addr: 0x5E, return: ['bool']},
    {addr: 0x5F, return: ['bool']},
    {addr: 0x68, return: ['8']},
    {addr: 0x6D, return: ['bool']},
    {addr: 0x6E, return: ['s8']},
    {addr: 0x70, return: ['bool']},
    {addr: 0x72, return: ['bool']},
    {addr: 0x73, return: ['analog2']},
    {addr: 0x74, return: ['bool']},
    {addr: 0x75, return: ['bool']},
    {addr: 0x76, return: ['analog2', 'constate']}, 
    {addr: 0x77, return: ['state']},
    {addr: 0x7A, return: ['bool']},
    {addr: 0x7B, return: ['bool']},
    {addr: 0x7C, return: ['analog2']},
    {addr: 0x81, return: ['analog2']},
    {addr: 0x82, return: ['bool']},
    {addr: 0x89, return: ['bool']},
    {addr: 0x8E, return: ['bool']},
    {addr: 0x8F, return: ['9']},
    {addr: 0x99, return: ['s8']},
    {addr: 0x9A, return: ['analog2', 'analog2', 'constate']}, 
    {addr: 0x9B, return: ['bool']},
    {addr: 0xA6, return: ['s8']},
    {addr: 0xA9, return: ['s8']},
    {addr: 0xAA, return: ['bool']},
    {addr: 0xAB, return: ['s8']},
    {addr: 0xAC, return: ['analog2']},
    {addr: 0xB0, return: ['bool']},
    {addr: 0xB9, return: ['analog2']},
    {addr: 0x07, return: ['state']},
    {addr: 0x09, return: ['analog2']},
    {addr: 0x0A, return: ['analog2']},
    {addr: 0x0B, return: ['analog2']},
    {addr: 0x21, return: ['s8']},
    {addr: 0x22, return: ['analog2']},
    {addr: 0x23, return: ['analog2']},
    {addr: 0x26, return: ['analog2']},
    {addr: 0x28, return: ['analog2']},
    {addr: 0x29, return: ['analog2']},
    {addr: 0x2E, return: ['analog2']},
    {addr: 0x32, return: ['analog2']},
    {addr: 0x3C, return: ['bool']},
    {addr: 0x3E, return: ['bool']},
    {addr: 0x40, return: ['bool']},
    {addr: 0x0, return: ["u8"]},
    {addr: 0x11, return: ["u8"]},
    {addr: 0x14, return: ["analog2","analog2","constate"]},
    {addr: 0x15, return: ["analog2","analog2","constate"]},
    {addr: 0x1a, return: ["u8"]},
    {addr: 0x1e, return: ["s8"]},
    {addr: 0x2c, return: ["s8"]},
    {addr: 0x2d, return: ["s8"]},
    {addr: 0x33, return: ["analog2"]},
    {addr: 0x34, return: ["analog2"]},
    {addr: 0x35, return: ["analog2"]},
    {addr: 0x36, return: ["analog2"]},
    {addr: 0x37, return: ["analog2"]},
    {addr: 0x41, return: ["analog2"]},
    {addr: 0x4a, return: ["u8"]},
    {addr: 0x52, return: ["state"]},
    {addr: 0x5a, return: ["u8"]},
    {addr: 0x67, return: ["s8"]},
    {addr: 0x79, return: ["u8"]},
    {addr: 0x7d, return: ["analog2"]},
    {addr: 0x7e, return: ["s8"]},
    {addr: 0x7f, return: ["analog2"]},
    {addr: 0x80, return: ["analog2"]},
    {addr: 0x84, return: ["analog2"]},
    {addr: 0x86, return: ["u8"]},
    {addr: 0x87, return: ["u8"]},
    {addr: 0x8a, return: ["s8"]},
    {addr: 0x8b, return: ["state"]},
    {addr: 0x8c, return: ["u8"]},
    {addr: 0x90, return: ["analog2"]},
    {addr: 0x91, return: ["analog2"]},
    {addr: 0x92, return: ["s8"]},
    {addr: 0x93, return: ["s8"]},
    {addr: 0x94, return: ["u8"]},
    {addr: 0xb1, return: ["analog2"]},
    {addr: 0xba, return: ["u8"]},
    {addr: 0xbb, return: ["u8"]},
    {addr: 0xbc, return: ["u8"]},
    {addr: 0xbd, return: ["u8"]},
    {addr: 0xbe, return: ["analog2"]},
    {addr: 0xbf, return: ["u8"]},
    {addr: 0xc0, return: ["s8"]},
    {addr: 0xc1, return: ["u8"]},
*/
];

function getDataSz(arr){
    return arr.reduce((p,c)=>p+c.size, 0);
}
function parseData(buf, arr){
    let offs = 0;
    const res = [];
    for(const t of arr){
        const e = vals[t];
        if(!e)
            throw new Error('unknown val type: '+t);
        const val = e.read(buf, offs);
        res.push(val);
        offs += e.size;
    }
    return res;
}

export class Vaillant{
    constructor(serport){
        this.serport = serport;
        this.chunks = [];
        this.stream = new stream.Duplex({
            write: (chunk, encoding, next) => {
                this.chunks.push(chunk);
                const pktlen = this.chunks[0].readUInt8(0);
                const recv = this.chunks.reduce((p, c)=>p+c.length, 0);
                if(recv >= pktlen){
                    const buf = Buffer.alloc(pktlen);
                    let added = 0;
                    while(added < pktlen){
                        const left = pktlen - added;
                        if(left < this.chunks[0].length){
                            added += this.chunks[0].copy(buf, added, 0, left);
                            this.chunks[0] = this.chunks[0].slice(left);
                        }else{
                            added += this.chunks.shift().copy(buf, added);
                        }
                    }
                    this.stream.push(buf);
                }
                next();
            },
            read: ()=>{}
        });
        this.serport.pipe(this.stream);
    }

    readPkt(){
        return new Promise((res, rej)=>{
            const handle = d=>{
                res(d);
                clearTimeout(tmout);
            }
            this.stream.once('data', handle);
            const tmout = setTimeout(()=>{
                this.stream.off('data', handle);
                if(this.chunks.length > 0)
                    console.error('recv timeout w chunks left', this.chunks);
                this.chunks = [];
                rej(new Error('recv timeout'));
            }, 800)
        });
    }

    async reqAndAnswer(pkt, expLen){
        this.serport.write(pkt);
        const buf = await this.readPkt(); //this.serport.read(expLen+3);
        return parseMsg(buf);
    }

    async reqAddr(addrinfo){
        const expRet = getDataSz(addrinfo.return.map(t=>vals[t]));
        const buf = Buffer.from([0,0,addrinfo.addr,expRet]);
        const ret = await this.reqAndAnswer(buildPacket(msgTypes.GET, buf));
        if(!ret)
            return null;
        const res = parseData(ret.data, addrinfo.return);
        return res;
    }

    async setAddr(addr, val){
        let addrinfo;
        if(typeof addr == 'object')
            addrinfo = addr;
        else
            addrinfo = addresses.find(a=>a.addr == addr);
        if(addrinfo.return.length > 1){
            throw new Error('currently can only write single typed values');
        }
        const sz = getDataSz(addrinfo.return.map(t=>vals[t]));
        const data = Buffer.alloc(sz+1);
        data.writeUInt8(addrinfo.addr);
        let offs = 1;
        for(let i=0;i<addrinfo.return;i++){
            const t = vals[r];
            t.write(b,offs,val[i])
            offs += r.size;
        }
        const pkt = buildPacket(msgTypes.SET, data);
        console.log(pkt)
        return await this.reqAndAnswer(pkt);
    }

    convData(addrinfo, data){
        const res = [];
        for(const i in addrinfo.return){
            const vt = addrinfo.return[i];
            if(vals[vt].conv)
                res.push(vals[vt].conv(data[i]));
            else
                res.push(data[i]);
        }
        return res;
    }
}

