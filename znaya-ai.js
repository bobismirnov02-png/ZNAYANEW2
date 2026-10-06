(() => {
  'use strict';

  const DEFAULT_PUTER_MODEL='openai/gpt-5.6-luna';
  const DEFAULT_GEMINI_MODEL='gemini-3.8-flash';
  const DEFAULT_GROQ_MODEL='qwen/qwen3.8-27b';
  const SESSION_KEYS={gemini:'znaya-gemini-key',groq:'znaya-groq-key'};
  const LEGACY_KEYS={gemini:'biohim42-gemini-key',groq:'biohim42-groq-key'};
  let authPromise=null;
  let lastProvider='';

  const schema={
    type:'object',additionalProperties:false,properties:{questions:{type:'array',items:{
      type:'object',additionalProperties:false,properties:{
        type:{type:'string',enum:['mcq','open','yesno','combo','match']},number:{type:'integer'},q:{type:'string'},
        o:{type:'array',items:{type:'string'},minItems:0,maxItems:4},a:{type:'string',enum:['A','B','C','D','']},answer:{type:'string'},
        subpoints:{type:'array',items:{type:'string'},maxItems:8},comboOptions:{type:'array',items:{type:'string'},maxItems:12},
        comboAnswer:{type:'string'},matchLeft:{type:'array',items:{type:'string'},maxItems:8},matchRight:{type:'array',items:{type:'string'},maxItems:8},
        matchAnswer:{type:'string'},e:{type:'string'},topic:{type:'string'},sourceImageIndex:{type:'integer'},sourceImageName:{type:'string'}
      },required:['type','number','q','o','a','answer','subpoints','comboOptions','comboAnswer','matchLeft','matchRight','matchAnswer','e','topic','sourceImageIndex','sourceImageName']
    }}},required:['questions']
  };

  const subjectLabel=s=>({biology:'Биология',chemistry:'Химия','history-law':'История на държавата и правото','theory-law':'Обща теория на правото','human-action':'Човешко действие (икономика)',law:'Обща теория на правото'}[s]||'Предмет');

  function stateSettings(){
    const s=window.ZNAYA_STATE?.settings||{};
    return {
      mode:['auto','puter','gemini','groq','off'].includes(s.aiMode)?s.aiMode:'auto',
      puterModel:s.puterModel||DEFAULT_PUTER_MODEL,
      backupProvider:['gemini','groq','none'].includes(s.backupProvider)?s.backupProvider:'none',
      geminiModel:s.geminiModel||DEFAULT_GEMINI_MODEL,
      groqModel:s.groqModel||DEFAULT_GROQ_MODEL
    };
  }
  function sessionKey(provider){
    try{return sessionStorage.getItem(SESSION_KEYS[provider])||sessionStorage.getItem(LEGACY_KEYS[provider])||'';}catch{return'';}
  }
  function backupReady(s){return s.backupProvider!=='none'&&!!sessionKey(s.backupProvider);}
  function providerLabel(p){return p==='gemini'?'Gemini':p==='groq'?'Groq':'Puter';}
  function isLikelyQuota(err){return /quota|credit|limit|rate|429|balance|payment|usage|insufficient/i.test(String(err?.message||err||''));}

  async function ensurePuterLoaded(){
    if(window.puter?.ai?.chat&&window.puter?.auth)return;
    if(window.ZNAYAPuterReady){await window.ZNAYAPuterReady;}
    if(!window.puter?.ai?.chat||!window.puter?.auth)throw new Error('ZNAYA AI не може да се зареди. Провери интернет връзката и опитай отново.');
  }
  async function ensureSignedIn(){
    await ensurePuterLoaded();
    if(puter.auth.isSignedIn()){try{return await puter.auth.getUser();}catch{return null;}}
    if(!authPromise)authPromise=puter.auth.signIn().finally(()=>{authPromise=null;});
    try{await authPromise;}catch(err){
      const code=err?.error||err?.code||'';
      if(code==='popup_blocked')throw new Error('Браузърът блокира прозореца за вход. Разреши pop-up за сайта и опитай отново.');
      if(code==='auth_window_closed')throw new Error('Входът беше отказан или прозорецът беше затворен.');
      throw new Error(err?.msg||err?.message||'Неуспешен вход в ZNAYA AI.');
    }
    try{return await puter.auth.getUser();}catch{return null;}
  }

  function parseJsonText(text){
    const clean=String(text||'').replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/i,'').trim();
    if(!clean)throw new Error('AI не върна структурирано съдържание.');
    try{return JSON.parse(clean);}catch{}
    const a=clean.indexOf('{'),b=clean.lastIndexOf('}');
    if(a>=0&&b>a)return JSON.parse(clean.slice(a,b+1));
    throw new Error('AI отговорът не е валиден JSON.');
  }
  function parsePuterResponse(resp){
    const calls=resp?.message?.tool_calls||resp?.tool_calls||[];
    for(const call of calls){
      if(call?.function?.name!=='submit_znaya_questions')continue;
      const raw=call.function.arguments, obj=typeof raw==='string'?JSON.parse(raw):raw;
      if(Array.isArray(obj?.questions))return obj;
    }
    const content=resp?.message?.content??resp?.content??resp?.output_text??'';
    const obj=parseJsonText(typeof content==='string'?content:JSON.stringify(content));
    if(!Array.isArray(obj?.questions))throw new Error('AI отговорът няма въпроси.');
    return obj;
  }
  function puterTools(){return [{type:'function',function:{name:'submit_znaya_questions',description:'Submit the complete structured ZNAYA question list. Always call this function exactly once.',strict:true,parameters:schema}}];}

  async function puterStructured({prompt,messages=null,model=DEFAULT_PUTER_MODEL,reasoningEffort='low'}){
    await ensureSignedIn();
    const options={model:model||DEFAULT_PUTER_MODEL,normalize:true,tools:puterTools(),reasoning_effort:reasoningEffort,max_tokens:12000};
    const format='\n\nФОРМАТ: ЗАДЪЛЖИТЕЛНО извикай submit_znaya_questions точно веднъж. Не връщай обикновен текст.';
    const invoke=retry=>{
      const extra=retry?'\nТова е повторен опит. Използвай функцията и не връщай свободен текст.':'';
      if(messages){
        const copy=messages.map(m=>({...m,content:Array.isArray(m.content)?m.content.map(x=>({...x})):m.content}));
        const last=copy[copy.length-1];
        if(last?.role==='user'){
          if(Array.isArray(last.content))last.content.push({type:'text',text:format+extra});
          else last.content=String(last.content||'')+format+extra;
        }
        return puter.ai.chat(copy,options);
      }
      return puter.ai.chat(String(prompt||'')+format+extra,options);
    };
    let r=await invoke(false);
    try{return parsePuterResponse(r);}catch(first){console.warn('ZNAYA structured retry',first);r=await invoke(true);return parsePuterResponse(r);}
  }

  function styleInstruction(mode){
    if(mode==='cards')return 'Използвай предимно open и match, като допускаш mcq и yesno, когато са естествени за материала.';
    if(mode==='test')return 'Използвай предимно mcq и yesno. При mcq използвай 3 или 4 смислени варианта и точно един правилен отговор A/B/C/D.';
    return 'Използвай балансирана смес от open, mcq, yesno и match; combo само когато материалът естествено го изисква.';
  }
  function buildPrompt({subject,title,count,difficulty,studyMode,files,materialText,materialMode}){
    const n=Math.max(3,Math.min(30,Number(count)||10));
    const topic=String(title||'').trim();
    const list=Array.from(files||[]), names=list.map(f=>f.name).filter(Boolean);
    const text=String(materialText||'').trim();
    const levels={easy:'лесно',medium:'средно',hard:'трудно',university:'университетско'};
    const exerciseMode=materialMode==='exercise';
    let sourceRule='Използвай устойчиви общоприети знания по посочената тема. При правните предмети не измисляй конкретни членове, срокове или променливи нормативни детайли.';
    if(list.length&&text)sourceRule=`Използвай САМО предоставените ${list.length} файла${names.length?' ('+names.join(', ')+')':''} и поставения текст. Третирай ги като един общ материал. Не добавяй външни факти. ПОСТАВЕН ТЕКСТ:\n${text}`;
    else if(list.length)sourceRule=`Използвай САМО предоставените ${list.length} файла${names.length?' ('+names.join(', ')+')':''}. Третирай ги като един общ материал. Не добавяй външни факти. Прочети внимателно всички изображения и PDF документи.`;
    else if(text)sourceRule=`Използвай САМО следния поставен текст. Не добавяй външни факти:\n${text}`;
    const countRule=exerciseMode
      ? 'Материалът е качен като тестови задачи. Създай по една карта за всеки оригинален видим въпрос от качения материал, в същия ред, без да добавяш, премахваш или сливаш въпроси. Запази оригиналната номерация и опциите максимално точно.'
      : (list.length
        ? `Цели се в около ${n} карти. ВАЖНО: ако някой от файловете е номериран тест/упражнение с отделни задачи, НЕ преформулирай и НЕ измисляй нови въпроси — създай по една карта за всеки оригинален видим въпрос (до 30), в същия ред и запази неговия отпечатан номер.`
        : `Създай точно ${n} качествени учебни карти/въпроси.`);
    const imageRule=list.length
      ? `За всяка карта, която идва от конкретен качен файл, попълни sourceImageIndex с нулевия индекс на файла в реда на качване (първият файл е 0) и sourceImageName с ТОЧНОТО име на този файл. Ако картата не е директно въпрос от конкретен файл, използвай sourceImageIndex=-1 и sourceImageName="".`
      : `За всички карти използвай sourceImageIndex=-1 и sourceImageName="".`;
    const learningStyle=exerciseMode?'Не променяй вида на оригиналните задачи: въпрос с варианти остава mcq, Да/Не остава yesno, свързване остава match, а свободен отговор остава open.':styleInstruction(studyMode);
    return `Ти си преподавател по ${subjectLabel(subject)} в ZNAYA. ${countRule} Тема: ${topic||'изведи я от материала'}. ${exerciseMode?'Трудността и броят въпроси се определят от самия качен тест.':`Трудност: ${levels[difficulty]||'средно'}.`} ${learningStyle} Всеки въпрос да проверява отделно знание и да няма дублиране. Ако материалът е тест/упражнение, запази оригиналния текст, опциите и номерацията максимално точно. За open попълни answer; за mcq попълни o и a; за yesno answer е само Да/Не; за match ЗАДЪЛЖИТЕЛНО попълни matchLeft и matchRight с еднакъв брой от 2 до 8 непразни елемента и matchAnswer във формат A:1; B:3; C:2. Всеки елемент отдясно трябва да се използва точно веднъж. Полето e да е кратко учебно обяснение, а topic — конкретната подтема. За неизползваните полета използвай празен стринг или празен масив. ${imageRule} ${sourceRule}`;
  }

  async function puterGenerateMaterial(args){
    await ensureSignedIn();
    const files=Array.from(args.files||[]), uploaded=[];
    try{
      for(const f of files){
        const result=await puter.fs.upload([f],'.',{overwrite:false,dedupeName:true});
        const item=Array.isArray(result)?result[0]:result;
        if(!item?.path)throw new Error(`Неуспешно качване на ${f.name||'файл'}.`);
        uploaded.push(item.path);
      }
      const content=uploaded.map(path=>({type:'file',puter_path:path}));
      content.push({type:'text',text:buildPrompt({...args,files})});
      return await puterStructured({messages:[{role:'user',content}],model:args.puterModel||DEFAULT_PUTER_MODEL,reasoningEffort:['hard','university'].includes(args.difficulty)?'medium':'low'});
    }finally{
      for(const path of uploaded){try{await puter.fs.delete(path);}catch{}}
      setTimeout(()=>window.ZNAYA_REFRESH_PUTER_CREDITS?.(),0);
    }
  }

  function readFileDataURL(file){return new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(String(r.result));r.onerror=()=>reject(new Error('Неуспешно прочитане на файла.'));r.readAsDataURL(file);});}
  async function byokGenerate(provider,args,model){
    const key=sessionKey(provider);if(!key)throw new Error(`Липсва личен ${providerLabel(provider)} API ключ.`);
    const attachments=[];
    for(const file of Array.from(args.files||[]))attachments.push({name:file.name,mime:file.type||'application/octet-stream',data:await readFileDataURL(file)});
    const r=await fetch('/api/byok/structured',{method:'POST',headers:{'Content-Type':'application/json','x-znaya-api-key':key,'x-biohim-api-key':key},body:JSON.stringify({provider,model,prompt:buildPrompt(args),attachments,reasoningEffort:['hard','university'].includes(args.difficulty)?'medium':'low'})});
    const raw=await r.text();let data;try{data=JSON.parse(raw);}catch{data={error:raw}}
    if(!r.ok)throw new Error(data?.error||`${providerLabel(provider)} HTTP ${r.status}`);
    if(!Array.isArray(data?.questions))throw new Error(`${providerLabel(provider)} не върна валидни карти.`);
    return data;
  }

  async function generateMaterial(args){
    const s=stateSettings();if(s.mode==='off')throw new Error('ZNAYA AI е изключен в настройките.');
    if(s.mode==='puter'){lastProvider='Puter';return puterGenerateMaterial({...args,puterModel:s.puterModel});}
    if(s.mode==='gemini'){lastProvider='Gemini';return byokGenerate('gemini',args,s.geminiModel);}
    if(s.mode==='groq'){lastProvider='Groq';return byokGenerate('groq',args,s.groqModel);}
    try{const out=await puterGenerateMaterial({...args,puterModel:s.puterModel});lastProvider='Puter';return out;}
    catch(err){
      console.warn('ZNAYA AI: Puter failed',err);
      if(!backupReady(s)){
        const note=isLikelyQuota(err)?'AI квотата вероятно е изчерпана.':'Основният AI е временно недостъпен.';
        throw new Error(`${note} ${err?.message||err}`);
      }
      const provider=s.backupProvider;lastProvider=providerLabel(provider);
      return byokGenerate(provider,args,provider==='gemini'?s.geminiModel:s.groqModel);
    }
  }

  window.ZNAYAAI={schema,settings:stateSettings,ensureSignedIn,generateMaterial,getLastProvider:()=>lastProvider,isPuterReady:()=>!!window.puter?.ai?.chat};
})();
