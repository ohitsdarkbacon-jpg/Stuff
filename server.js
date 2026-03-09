import express from "express"
import path from "path"
import {fileURLToPath} from "url"

const __filename=fileURLToPath(import.meta.url)
const __dirname=path.dirname(__filename)

const app=express()
app.use(express.json())

const MAX_SLOTS=6
const HOUR=3600000
const ADMIN_ID="1049068212182073344"

let keyPool=[]
let activeSlots=[]
let waitingQueue=[]

app.use(express.static(__dirname))

app.post("/api/manage-keys",(req,res)=>{

const{action,discordId,keys,amount}=req.body

if(!action||!discordId)return res.status(400).json({error:"missing params"})



if(action==="upload"){

if(discordId!==ADMIN_ID)return res.status(403).json({error:"admin only"})

keyPool.push(...keys)

return res.json({message:`${keys.length} keys added`})

}



if(action==="buy"){

if(keyPool.length<amount){

return res.json({error:"not enough keys in pool"})
}



let user=activeSlots.find(s=>s.discordId===discordId)



const newKeys=[]

for(let i=0;i<amount;i++){

newKeys.push(keyPool.shift())

}



if(!user){

if(activeSlots.length>=MAX_SLOTS){

waitingQueue.push({discordId,remaining:amount})

return res.json({queued:amount})

}



const first=newKeys.shift()

activeSlots.push({

discordId,

currentKey:first,

expiry:Date.now()+HOUR,

queue:newKeys

})

return res.json({activated:true})

}



user.queue.push(...newKeys)

return res.json({queued:user.queue.length})

}



if(action==="status"){

const slot=activeSlots.find(s=>s.discordId===discordId)

const timeLeft=slot?Math.max(0,slot.expiry-Date.now()):0

return res.json({

activeKey:slot?.currentKey||null,

timeLeftSeconds:Math.floor(timeLeft/1000),

queuedHours:slot?.queue.length||0,

queuePosition:waitingQueue.findIndex(q=>q.discordId===discordId)+1||null,

queueLength:waitingQueue.length,

activeCount:activeSlots.length

})

}

})



setInterval(()=>{

const now=Date.now()

activeSlots=activeSlots.filter(slot=>{

if(slot.expiry<=now){

if(slot.queue.length>0){

slot.currentKey=slot.queue.shift()

slot.expiry=now+HOUR

return true

}

return false

}

return true

})



while(activeSlots.length<MAX_SLOTS&&waitingQueue.length>0&&keyPool.length>0){

const next=waitingQueue.shift()

const key=keyPool.shift()

activeSlots.push({

discordId:next.discordId,

currentKey:key,

expiry:now+HOUR,

queue:[]

})

}

},30000)



app.listen(3000,()=>console.log("server running"))
