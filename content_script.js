// content_script.js
(function () {
    // ----------------------------------------------------------------
    // 1. handleStart() - chamado quando clica em "Start" no popup
    // ----------------------------------------------------------------
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      if (request.action === "START_ML_MODAL") {
        handleStart();
      }
    });
  
    async function handleStart() {
      // 1. Achar ID do produto na URL
      const productId = extractProductIdFromURL(window.location.href);
      if (!productId) {
        alert("Não foi possível identificar o ID do produto.");
        return;
      }
  
      // 2. Cria modal se não existir
      if (!document.getElementById("ml-info-lateral-modal")) {
        createModal();
      }
  
      // 3. Buscar dados do item principal + descrição
      const [itemData, itemDesc] = await Promise.all([
        fetchItemData(productId),
        fetchItemDescription(productId)
      ]);
      if (!itemData) {
        alert("Não foi possível buscar dados do item.");
        return;
      }
  
      // 4. Buscar dados adicionais (categoria, moeda, vendedor, site)
      let categoryData = null;
      let currencyData = null;
      let sellerData   = null;
      let siteData     = null;
      let topItems     = null;
  
      if (itemData.category_id) {
        categoryData = await fetchCategoryData(itemData.category_id);
      }
      if (itemData.currency_id) {
        currencyData = await fetchCurrencyData(itemData.currency_id);
      }
      if (itemData.seller_id) {
        sellerData = await fetchSellerData(itemData.seller_id);
      }
      if (itemData.site_id) {
        siteData = await fetchSiteData(itemData.site_id);
      }
  
      // 5. Buscar top 10 itens
      if (itemData.site_id && itemData.category_id) {
        const rawTopItems = await fetchTopSellingItemsInCategory(
          itemData.site_id,
          itemData.category_id
        );
        // single GET para cada um
        topItems = await fetchDetailedInfoForTopItemsIndividually(rawTopItems);
      }
  
      // 6. Preencher modal e exibir
      fillModalContent(
        itemData,
        itemDesc,
        categoryData,
        currencyData,
        sellerData,
        siteData,
        topItems
      );
      showModal();
    }
  
    // ----------------------------------------------------------------
    // 2. Extrair ID do produto na URL
    // ----------------------------------------------------------------
    function extractProductIdFromURL(url) {
      const regex = /(ML[A-Z]{1,3})-?(\d+)/i;
      const match = url.match(regex);
      if (!match) return null;
      return match[1] + match[2];
    }
  
    // ----------------------------------------------------------------
    // 3. Fetchers
    // ----------------------------------------------------------------
    async function fetchItemData(itemId) {
      try {
        const resp = await fetch(`https://api.mercadolibre.com/items/${itemId}`);
        if (!resp.ok) throw new Error("Erro ao buscar item " + itemId);
        return await resp.json();
      } catch (err) {
        console.error(err);
        return null;
      }
    }
    async function fetchItemDescription(itemId) {
      try {
        const resp = await fetch(`https://api.mercadolibre.com/items/${itemId}/description`);
        if (!resp.ok) {
          return { plain_text: "Sem descrição pública." };
        }
        return await resp.json();
      } catch (err) {
        console.error(err);
        return { plain_text: "Erro ao buscar descrição." };
      }
    }
    async function fetchCategoryData(catId) {
      try {
        const resp = await fetch(`https://api.mercadolibre.com/categories/${catId}`);
        if (!resp.ok) throw new Error("Erro ao buscar categoria");
        return await resp.json();
      } catch (err) {
        console.error(err);
        return null;
      }
    }
    async function fetchCurrencyData(curId) {
      try {
        const resp = await fetch(`https://api.mercadolibre.com/currencies/${curId}`);
        if (!resp.ok) throw new Error("Erro ao buscar moeda");
        return await resp.json();
      } catch (err) {
        console.error(err);
        return null;
      }
    }
    async function fetchSellerData(sellerId) {
      try {
        const resp = await fetch(`https://api.mercadolibre.com/users/${sellerId}`);
        if (!resp.ok) throw new Error("Erro ao buscar vendedor");
        return await resp.json();
      } catch (err) {
        console.error(err);
        return null;
      }
    }
    async function fetchSiteData(siteId) {
      try {
        const resp = await fetch(`https://api.mercadolibre.com/sites/${siteId}`);
        if (!resp.ok) throw new Error("Erro ao buscar site");
        return await resp.json();
      } catch (err) {
        console.error(err);
        return null;
      }
    }
    async function fetchTopSellingItemsInCategory(siteId, catId) {
      const url = `https://api.mercadolibre.com/sites/${siteId}/search?category=${catId}&sort=sold_quantity_desc&limit=10`;
      try {
        const resp = await fetch(url);
        if (!resp.ok) throw new Error("Erro ao buscar top itens " + catId);
        const data = await resp.json();
        return data.results || [];
      } catch (err) {
        console.error(err);
        return [];
      }
    }
  
    async function fetchDetailedInfoForTopItemsIndividually(rawItems) {
      if (!rawItems || rawItems.length===0) return [];
      const promises = rawItems.map(async (basicItem) => {
        const full = await fetchItemData(basicItem.id);
        if (!full) {
          return {...basicItem, health:null};
        }
        const soldQty = full.sold_quantity ?? 0;
        const price   = full.price ?? 0;
        const dateC   = full.date_created ? new Date(full.date_created) : null;
        let healthVal = typeof full.health==="number" ? full.health : null;
  
        let daysOnPlatform=0;
        if (dateC) {
          const now=new Date();
          daysOnPlatform=Math.max((now - dateC)/(1000*60*60*24),1);
        }
        let avgDay=soldQty/daysOnPlatform;
        let temp="Baixa";
        if(avgDay>=5) temp="Alta";
        else if(avgDay>=1) temp="Média";
  
        return {
          id: basicItem.id,
          title: full.title || basicItem.title,
          price,
          sold_quantity: soldQty,
          free_shipping: !!(full.shipping?.free_shipping),
          permalink: full.permalink || basicItem.permalink,
          thumbnail: full.thumbnail || basicItem.thumbnail,
          date_created: dateC,
          health: healthVal,
          avg_sold_per_day: avgDay,
          temperature: temp
        };
      });
      return Promise.all(promises);
    }
  
    // ----------------------------------------------------------------
    // 4. Criar Modal e Exibir
    // ----------------------------------------------------------------
    function createModal() {
      const modal = document.createElement("div");
      modal.id="ml-info-lateral-modal";
      modal.classList.add("apple-design-modal");
      modal.innerHTML=`
        <div id="ml-info-header">
          <span id="ml-info-title">Informações do Produto</span>
          <button id="ml-info-close">&times;</button>
        </div>
        <div id="ml-info-content"></div>
      `;
      document.body.appendChild(modal);
  
      const closeBtn=modal.querySelector("#ml-info-close");
      closeBtn.addEventListener("click",()=>{
        modal.style.display="none";
      });
    }
    function showModal() {
      const modal = document.getElementById("ml-info-lateral-modal");
      if(modal) modal.style.display="block";
    }
  
    // ----------------------------------------------------------------
    // 5. fillModalContent
    // ----------------------------------------------------------------
    function fillModalContent(itemData, itemDesc, catData, curData, sellerData, siteData, topItems) {
      const contentDiv=document.getElementById("ml-info-content");
      if(!contentDiv) return;
      contentDiv.innerHTML="";
  
      // item principal
      const {
        id,title,price,currency_id,thumbnail,secure_thumbnail,
        permalink,sold_quantity,condition,shipping,health
      }=itemData;
  
      let healthHTML="";
      if(typeof health==="number"){
        healthHTML=createHealthSemiCircle(health);
      }else{
        healthHTML=`<p>Health: N/D</p>`;
      }
  
      const basicInfoCard=createCollapsibleCard(
        "Informações do Item",
        `
          <div class="info-row"><strong>ID:</strong> ${id}</div>
          <div class="info-row"><strong>Título:</strong> ${title}</div>
          <div class="info-row"><strong>Preço:</strong> ${price} ${currency_id}</div>
          <div class="info-row"><strong>Condição:</strong> ${condition==="new"?"Novo":"Usado"}</div>
          <div class="info-row"><strong>Vendidos:</strong> ${sold_quantity||0}</div>
          <div class="info-row"><strong>Frete Grátis?:</strong> ${shipping?.free_shipping?"Sim":"Não"}</div>
          <div class="info-row">
            <strong>Link Produto:</strong>
            <a href="${permalink}" target="_blank">Abrir</a>
          </div>
          <hr/>
          <div class="info-row">
            <img src="${secure_thumbnail || thumbnail}" 
                 style="max-width:100%; border-radius:8px;"
                 alt="thumb">
          </div>
          <hr/>
          <div class="info-row">
            <strong>Saúde (health):</strong>
          </div>
          ${healthHTML}
        `
      );
  
      // descrição
      const descriptionCard=createCollapsibleCard(
        "Descrição do Produto",
        `
          <div class="info-row">
            <strong>Descrição:</strong>
            <p>${itemDesc?.plain_text??"Sem descrição pública."}</p>
          </div>
        `
      );
  
      // categoria
      let catHTML="<p>Categoria não disponível</p>";
      if(catData){
        const {id,name,path_from_root}=catData;
        const path=path_from_root? path_from_root.map(c=>c.name).join(" > "):name;
        catHTML=`
          <div class="info-row"><strong>ID da Categoria:</strong> ${id}</div>
          <div class="info-row"><strong>Nome:</strong> ${name}</div>
          <div class="info-row"><strong>Caminho:</strong> ${path}</div>
        `;
        if(topItems&&topItems.length>0){
          catHTML+=`
            <hr/>
            <div class="info-row">
              <strong>Top 10 itens mais vendidos dessa categoria:</strong>
            </div>
            <div id="top-items-container" style="margin-top:8px;"></div>
          `;
        }
      }
      const categoryCard=createCollapsibleCard("Categoria",catHTML);
  
      // Moeda
      let curHTML="<p>Moeda não disponível</p>";
      if(curData){
        const{id,description,symbol}=curData;
        curHTML=`
          <div class="info-row"><strong>ID:</strong> ${id}</div>
          <div class="info-row"><strong>Nome:</strong> ${description}</div>
          <div class="info-row"><strong>Símbolo:</strong> ${symbol}</div>
        `;
      }
      const currencyCard=createCollapsibleCard("Moeda",curHTML);
  
      // Vendedor
      let sellerHTML="<p>Informações do vendedor não disponíveis</p>";
      if(sellerData){
        const{id,nickname,permalink:sellerLink}=sellerData;
        sellerHTML=`
          <div class="info-row"><strong>ID do Vendedor:</strong> ${id}</div>
          <div class="info-row"><strong>Nickname:</strong> ${nickname??"N/D"}</div>
          ${
            sellerLink
            ?`<div class="info-row">
                 <strong>Link:</strong>
                 <a href="${sellerLink}" target="_blank">${sellerLink}</a>
              </div>`
            :""
          }
        `;
      }
      const sellerCard=createCollapsibleCard("Vendedor",sellerHTML);
  
      // Site
      let siteHTML="<p>Informações do site não disponíveis.</p>";
      if(siteData){
        const{id,name,default_currency_id}=siteData;
        siteHTML=`
          <div class="info-row"><strong>ID do Site:</strong> ${id}</div>
          <div class="info-row"><strong>Nome:</strong> ${name}</div>
          <div class="info-row"><strong>Moeda Padrão:</strong> ${default_currency_id}</div>
        `;
      }
      const siteCard=createCollapsibleCard("Site",siteHTML);
  
      // Adiciona cards
      contentDiv.appendChild(basicInfoCard);
      contentDiv.appendChild(descriptionCard);
      contentDiv.appendChild(categoryCard);
      contentDiv.appendChild(currencyCard);
      contentDiv.appendChild(sellerCard);
      contentDiv.appendChild(siteCard);
  
      // top 10
      if(topItems&&topItems.length>0){
        const topContainer=document.getElementById("top-items-container");
        if(topContainer){
          topItems.forEach((tcItem,idx)=>{
            const miniCard=document.createElement("div");
            miniCard.classList.add("mini-card");
  
            let dateStr="N/D";
            if(tcItem.date_created instanceof Date){
              dateStr=tcItem.date_created.toLocaleDateString("pt-BR",{year:"numeric",month:"2-digit",day:"2-digit"});
            }
  
            let arcHTML="";
            if(typeof tcItem.health==="number"){
              arcHTML=createHealthSemiCircle(tcItem.health);
            }else{
              arcHTML=`<p>Health: N/D</p>`;
            }
  
            miniCard.innerHTML=`
              <div class="mini-card-header">
                <strong>#${idx+1}</strong> -
                <a href="${tcItem.permalink}" target="_blank">${tcItem.title}</a>
              </div>
              <div class="mini-card-body">
                <p><strong>Preço:</strong> ${tcItem.price}</p>
                <p><strong>Vendidos:</strong> ${tcItem.sold_quantity}</p>
                <p><strong>Frete Grátis?</strong> ${tcItem.free_shipping?"Sim":"Não"}</p>
                <p><strong>Data de Publicação:</strong> ${dateStr}</p>
                <p><strong>Média vendida/dia:</strong> ${
                  isNaN(tcItem.avg_sold_per_day)? "N/D":tcItem.avg_sold_per_day.toFixed(2)
                }</p>
                <p><strong>Temperatura:</strong> ${tcItem.temperature}</p>
                <p><strong>Saúde (health):</strong></p>
                ${arcHTML}
              </div>
            `;
            topContainer.appendChild(miniCard);
          });
        }
      }
  
      setupCollapsibleBehavior();
    }
  
    // ----------------------------------------------------------------
    // 6. createCollapsibleCard + Behavior
    // ----------------------------------------------------------------
    function createCollapsibleCard(title, contentHTML) {
      const card=document.createElement("div");
      card.classList.add("collapsible-card");
  
      const header=document.createElement("button");
      header.classList.add("card-header");
      header.textContent=title;
  
      const content=document.createElement("div");
      content.classList.add("card-content","hidden");
      content.innerHTML=contentHTML;
  
      card.appendChild(header);
      card.appendChild(content);
      return card;
    }
    function setupCollapsibleBehavior() {
      const headers=document.querySelectorAll(".card-header");
      headers.forEach((hdr)=>{
        hdr.addEventListener("click",()=>{
          const c=hdr.nextElementSibling;
          if(!c)return;
          c.classList.toggle("hidden");
        });
      });
    }
  
    // ----------------------------------------------------------------
    // 7. Criação do SEMICÍRCULO
    // ----------------------------------------------------------------
    /**
/**
 * Cria um semicírculo (topo) que vai de 0..180 graus,
 * desenhando um arco de fundo (cinza) + arco colorido parcial.
 * 
 * Queremos que "0°" seja o canto esquerdo do arco, e "180°" seja o canto direito.
 * Se healthValue = 0.75, por exemplo, o arco colorido ocupa 75% (da esquerda até mais ou menos o 3/4 do caminho).
 */
function createHealthSemiCircle(healthValue) {
    const MIN = 0.01;
    const MAX = 1.0;
    const clamped = Math.max(MIN, Math.min(MAX, healthValue));
    const fraction = (clamped - MIN) / (MAX - MIN);
    // "angle" em graus => 0..180
    const angle = fraction * 85;
    const displayValue = clamped.toFixed(2);
  
    return `
  <svg
    width="180" height="110"
    viewBox="0 0 180 110"
    xmlns="http://www.w3.org/2000/svg"
  >
    <defs>
      <linearGradient id="gradientArc" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stop-color="#ff0000" />
        <stop offset="50%" stop-color="#ffcc00" />
        <stop offset="100%" stop-color="#00cc00" />
      </linearGradient>
    </defs>
  
    <!-- Arco de fundo, 0..180 (cinza) -->
    <path
      d="${describeArc(90,90,77, -85, 85)}"
      fill="none"
      stroke="#eee"
      stroke-width="15"
      stroke-linecap="round"
    />
  
    <!-- Arco colorido, 0..angle -->
    <path
      d="${describeArc(90,90,77, -85, angle)}"
      fill="none"
      stroke="url(#gradientArc)"
      stroke-width="15"
      stroke-linecap="round"
    />
  
    <!-- Texto do valor (ex.: 0.75) um pouco abaixo do arco -->
    <text x="50%" y="70" text-anchor="middle"
          font-size="18" font-weight="bold"
          fill="#333">
      ${displayValue}
    </text>
  
    <!-- Label "Health" abaixo do valor -->
    <text x="50%" y="90" text-anchor="middle"
          font-size="12" fill="#666">
      Health
    </text>
  
    <!-- Legendas min e max (0.01 e 1.0) -->
    <text x="5" y="105" font-size="10" fill="#666">${MIN}</text>
    <text x="175" y="105" font-size="10" fill="#666" text-anchor="end">${MAX}</text>
  </svg>
    `;
  }
  
  /**
   * Gera o "d" de um arco que vai de startAngle..endAngle (em graus).
   * 
   * Para que 0° seja o CANTO ESQUERDO do arco (em cima) e 180° o CANTO DIREITO,
   * fazemos um offset de -90 dentro de 'polarToCartesian'.
   */
  function describeArc(cx, cy, r, startAngle, endAngle) {
    const start = polarToCartesian(cx, cy, r, endAngle - 90);
    const end   = polarToCartesian(cx, cy, r, startAngle - 90);
  
    const largeArcFlag = (endAngle - startAngle) <= 180 ? 0 : 1;
    return [
      "M", start.x, start.y,
      "A", r, r, 0, largeArcFlag, 0, end.x, end.y
    ].join(" ");
  }
  
  /**
   * Converte Ângulo->Coordenadas, 
   * definindo 0° = canto esquerdo do semicírculo (top).
   */
  function polarToCartesian(cx, cy, r, angleInDegrees) {
    const rad = (angleInDegrees * Math.PI) / 180;
    return {
      x: cx + (r * Math.cos(rad)),
      y: cy + (r * Math.sin(rad))
    };
  }
  
  })();
  