// content_script.js
(function () {
    // Quando clicam no botão "Start" no popup, recebemos a mensagem aqui
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      if (request.action === "START_ML_MODAL") {
        handleStart();
      }
    });
  
    // =========================
    // 1. handleStart
    // =========================
    async function handleStart() {
      console.log("handleStart: Iniciando captura do ID do produto...");
  
      // 1. Achar ID do produto na URL
      const productId = extractProductIdFromURL(window.location.href);
      console.log("Produto principal ID extraído =>", productId);
  
      if (!productId) {
        alert("Não foi possível identificar o ID do produto.");
        return;
      }
  
      // 2. Se o modal não existir, cria
      let existingModal = document.getElementById("ml-info-lateral-modal");
      if (!existingModal) {
        console.log("Criando modal pela primeira vez...");
        createModal();
      }
  
      console.log("Buscando dados do item principal e descrição...");
      // 3. Buscar dados do item principal + descrição
      const [itemData, itemDescription] = await Promise.all([
        fetchItemData(productId),
        fetchItemDescription(productId)
      ]);
  
      console.log("itemData =>", itemData);
      console.log("itemDescription =>", itemDescription);
  
      if (!itemData) {
        alert("Não foi possível buscar os dados do item principal.");
        return;
      }
  
      // 4. Buscar dados adicionais (categoria, moeda, vendedor, site)
      console.log("Buscando dados adicionais (categoria, moeda, vendedor, site)...");
      let categoryData = null;
      let currencyData = null;
      let sellerData = null;
      let siteData = null;
      let topCategoryItems = null; // 10 itens mais vendidos dessa categoria
  
      if (itemData.category_id) {
        categoryData = await fetchCategoryData(itemData.category_id);
        console.log("categoryData =>", categoryData);
      }
  
      if (itemData.currency_id) {
        currencyData = await fetchCurrencyData(itemData.currency_id);
        console.log("currencyData =>", currencyData);
      }
  
      if (itemData.seller_id) {
        sellerData = await fetchSellerData(itemData.seller_id);
        console.log("sellerData =>", sellerData);
      }
  
      if (itemData.site_id) {
        siteData = await fetchSiteData(itemData.site_id);
        console.log("siteData =>", siteData);
      }
  
      // 5. Se tivermos site_id e category_id, busca top 10 itens
      if (itemData.site_id && itemData.category_id) {
        console.log("Buscando top 10 itens mais vendidos...");
        const rawTopCategoryItems = await fetchTopSellingItemsInCategory(
          itemData.site_id,
          itemData.category_id
        );
        console.log("rawTopCategoryItems =>", rawTopCategoryItems);
  
        // 6. Para cada um dos 10 itens, chamar SINGLE GET e enriquecer
        topCategoryItems = await fetchDetailedInfoForTopItemsIndividually(rawTopCategoryItems);
        console.log("topCategoryItems =>", topCategoryItems);
      }
  
      // 7. Preenche e exibe o modal
      console.log("Chamando fillModalContent com todos os dados...");
      fillModalContent(
        itemData,
        itemDescription,
        categoryData,
        currencyData,
        sellerData,
        siteData,
        topCategoryItems
      );
  
      showModal();
    }
  
    // =========================
    // 2. Extrair o ID do produto
    // =========================
    function extractProductIdFromURL(url) {
      // Captura 'ML' + 1 a 3 letras + hífen opcional + dígitos
      const regex = /(ML[A-Z]{1,3})-?(\d+)/i;
      const match = url.match(regex);
      if (match) {
        return match[1] + match[2]; // ex.: 'MLB' + '123456789' => 'MLB123456789'
      }
      return null;
    }
  
    // =========================
    // 3. Funções de Fetch (básicas)
    // =========================
    async function fetchItemData(itemId) {
      try {
        const url = `https://api.mercadolibre.com/items/${itemId}`;
        console.log("fetchItemData =>", url);
        const response = await fetch(url);
        if (!response.ok) {
          throw new Error("Erro ao buscar dados do item: " + itemId);
        }
        const data = await response.json();
        console.log("fetchItemData OK =>", data);
        return data;
      } catch (error) {
        console.error(error);
        return null;
      }
    }
  
    async function fetchItemDescription(itemId) {
      try {
        const url = `https://api.mercadolibre.com/items/${itemId}/description`;
        console.log("fetchItemDescription =>", url);
        const response = await fetch(url);
        if (!response.ok) {
          // Alguns itens não têm descrição pública
          return { plain_text: "Sem descrição pública disponível." };
        }
        const data = await response.json();
        console.log("fetchItemDescription OK =>", data);
        return data;
      } catch (error) {
        console.error(error);
        return { plain_text: "Erro ao buscar descrição" };
      }
    }
  
    async function fetchCategoryData(categoryId) {
      try {
        const url = `https://api.mercadolibre.com/categories/${categoryId}`;
        console.log("fetchCategoryData =>", url);
        const response = await fetch(url);
        if (!response.ok) {
          throw new Error("Erro ao buscar dados da categoria");
        }
        return await response.json();
      } catch (error) {
        console.error(error);
        return null;
      }
    }
  
    async function fetchCurrencyData(currencyId) {
      try {
        const url = `https://api.mercadolibre.com/currencies/${currencyId}`;
        console.log("fetchCurrencyData =>", url);
        const response = await fetch(url);
        if (!response.ok) {
          throw new Error("Erro ao buscar dados da moeda");
        }
        return await response.json();
      } catch (error) {
        console.error(error);
        return null;
      }
    }
  
    async function fetchSellerData(sellerId) {
      try {
        const url = `https://api.mercadolibre.com/users/${sellerId}`;
        console.log("fetchSellerData =>", url);
        const response = await fetch(url);
        if (!response.ok) {
          // Pode retornar 403 se o usuário não permitir dados públicos
          throw new Error("Erro ao buscar dados do vendedor");
        }
        return await response.json();
      } catch (error) {
        console.error(error);
        return null;
      }
    }
  
    async function fetchSiteData(siteId) {
      try {
        const url = `https://api.mercadolibre.com/sites/${siteId}`;
        console.log("fetchSiteData =>", url);
        const response = await fetch(url);
        if (!response.ok) {
          throw new Error("Erro ao buscar dados do site");
        }
        return await response.json();
      } catch (error) {
        console.error(error);
        return null;
      }
    }
  
    // =========================
    // 4. Buscar os 10 itens mais vendidos de uma categoria
    // =========================
    async function fetchTopSellingItemsInCategory(siteId, categoryId) {
      const limit = 10;
      const sort = "sold_quantity_desc";
      const url = `https://api.mercadolibre.com/sites/${siteId}/search?category=${categoryId}&sort=${sort}&limit=${limit}`;
  
      try {
        console.log("fetchTopSellingItemsInCategory =>", url);
        const response = await fetch(url);
        if (!response.ok) {
          throw new Error(`Erro ao buscar itens da categoria ${categoryId}`);
        }
        const data = await response.json();
        console.log("fetchTopSellingItemsInCategory OK =>", data);
        return data.results || [];
      } catch (error) {
        console.error(error);
        return [];
      }
    }
  
    // =========================
    // 5. Para cada item do top 10, chamar SINGLE GET
    // =========================
    async function fetchDetailedInfoForTopItemsIndividually(rawItems) {
      if (!rawItems || rawItems.length === 0) return [];
  
      // Fazemos single GET para cada item
      const promises = rawItems.map(async (basicItem, index) => {
        console.log(`Top item #${index + 1} =>`, basicItem);
        const itemId = basicItem.id;
        const full = await fetchItemData(itemId); // single GET
        if (!full) {
          console.warn("Não retornou dados no single GET para", itemId);
          return {
            ...basicItem,
            date_created: null,
            health: null,
            temperature: "N/D",
            avg_sold_per_day: NaN
          };
        }
  
        const soldQty = full.sold_quantity ?? basicItem.sold_quantity ?? 0;
        const price = full.price ?? basicItem.price ?? 0;
        const title = full.title ?? basicItem.title;
        const thumbnail = full.thumbnail || basicItem.thumbnail;
        const permalink = full.permalink || basicItem.permalink;
        const dateCreated = full.date_created ? new Date(full.date_created) : null;
        let healthVal = typeof full.health === "number" ? full.health : null;
  
        // (Opcional) Forçar health = 0 se vier null, para teste:
        // if (healthVal === null) {
        //   healthVal = 0;
        // }
  
        // Cálculo de dias desde publicação
        let daysOnPlatform = 0;
        if (dateCreated) {
          const now = new Date();
          const diffMs = now - dateCreated;
          daysOnPlatform = Math.max(diffMs / (1000 * 60 * 60 * 24), 1);
        }
        const avgSoldPerDay = soldQty / daysOnPlatform;
  
        // Define “temperatura” simples
        let temperature = "Baixa";
        if (avgSoldPerDay >= 5) {
          temperature = "Alta";
        } else if (avgSoldPerDay >= 1) {
          temperature = "Média";
        }
  
        const enriched = {
          id: itemId,
          title,
          price,
          sold_quantity: soldQty,
          free_shipping: !!(full.shipping?.free_shipping || basicItem.shipping?.free_shipping),
          permalink,
          thumbnail,
          date_created: dateCreated,
          health: healthVal,
          avg_sold_per_day: avgSoldPerDay,
          temperature
        };
        console.log(`#${index + 1} => enriched =>`, enriched);
        return enriched;
      });
  
      const enrichedItems = await Promise.all(promises);
      return enrichedItems;
    }
  
    // =========================
    // 6. Cria Modal e gerencia exibição
    // =========================
    function createModal() {
      const modal = document.createElement("div");
      modal.id = "ml-info-lateral-modal";
      modal.classList.add("apple-design-modal");
  
      modal.innerHTML = `
        <div id="ml-info-header">
          <span id="ml-info-title">Informações do Produto</span>
          <button id="ml-info-close">&times;</button>
        </div>
        <div id="ml-info-content"></div>
      `;
  
      document.body.appendChild(modal);
  
      const closeButton = modal.querySelector("#ml-info-close");
      closeButton.addEventListener("click", () => {
        modal.style.display = "none";
      });
    }
  
    function showModal() {
      const modal = document.getElementById("ml-info-lateral-modal");
      if (modal) {
        modal.style.display = "block";
      }
    }
  
    // =========================
    // 7. Preenche o modal com as infos + gauge
    // =========================
    function fillModalContent(
      itemData,
      itemDescription,
      categoryData,
      currencyData,
      sellerData,
      siteData,
      topCategoryItems
    ) {
      console.log(">>> fillModalContent chamado!");
      console.log("itemData (principal) =>", itemData);
      console.log("typeof itemData.health =>", typeof itemData.health, itemData.health);
  
      const contentDiv = document.getElementById("ml-info-content");
      if (!contentDiv) {
        console.warn("Não encontrou #ml-info-content no DOM!");
        return;
      }
  
      contentDiv.innerHTML = "";
  
      // Extraindo dados do item principal
      const {
        id,
        title,
        price,
        currency_id,
        thumbnail,
        secure_thumbnail,
        permalink,
        sold_quantity,
        condition,
        shipping,
        health
      } = itemData;
  
      // 7.1 Card: Informações do Item
      let healthGaugeHTML = "";
      if (typeof health === "number") {
        console.log("=> health é number, criando gauge com valor =>", health);
        healthGaugeHTML = createGaugeHTML(`gauge-main-item`, health);
      } else {
        console.log("=> health não é number, mostrando N/D =>", health);
        healthGaugeHTML = `<p>Health: N/D</p>`;
        // (Opcional) se quiser forçar 0 no gauge, descomente:
        // healthGaugeHTML = createGaugeHTML("gauge-main-item", 0);
      }
  
      const basicInfoCard = createCollapsibleCard(
        "Informações do Item",
        `
          <div class="info-row"><strong>ID:</strong> <span>${id}</span></div>
          <div class="info-row"><strong>Título:</strong> <span>${title}</span></div>
          <div class="info-row"><strong>Preço:</strong> <span>${price} ${currency_id}</span></div>
          <div class="info-row"><strong>Condição:</strong> <span>${
            condition === "new" ? "Novo" : "Usado"
          }</span></div>
          <div class="info-row"><strong>Vendidos:</strong> <span>${
            typeof sold_quantity === "number" ? sold_quantity : "undefined"
          }</span></div>
          <div class="info-row"><strong>Frete Grátis?:</strong> <span>${
            shipping?.free_shipping ? "Sim" : "Não"
          }</span></div>
          <div class="info-row">
            <strong>Link Produto:</strong>
            <a href="${permalink}" target="_blank">Abrir</a>
          </div>
          <hr/>
          <div class="info-row">
            <img src="${secure_thumbnail || thumbnail}" 
                 alt="thumbnail" 
                 style="max-width:100%; border-radius:8px;">
          </div>
          <hr/>
          <div class="info-row">
            <strong>Saúde (health):</strong>
          </div>
          ${healthGaugeHTML}
        `
      );
  
      // 7.2 Card: Descrição
      const descriptionCard = createCollapsibleCard(
        "Descrição do Produto",
        `
          <div class="info-row">
            <strong>Descrição:</strong>
            <p>${itemDescription?.plain_text ?? "Sem descrição pública."}</p>
          </div>
        `
      );
  
      // 7.3 Card: Categoria
      let categoryCardHTML = "<p>Categoria não disponível.</p>";
      if (categoryData) {
        const { id, name, path_from_root } = categoryData;
        const path = path_from_root
          ? path_from_root.map((c) => c.name).join(" > ")
          : name;
  
        categoryCardHTML = `
          <div class="info-row"><strong>ID da Categoria:</strong> <span>${id}</span></div>
          <div class="info-row"><strong>Nome:</strong> <span>${name}</span></div>
          <div class="info-row"><strong>Caminho:</strong> <span>${path}</span></div>
        `;
  
        // Se temos top 10, mostra sub-cards
        if (topCategoryItems && topCategoryItems.length > 0) {
          categoryCardHTML += `
            <hr/>
            <div class="info-row">
              <strong>Top 10 itens mais vendidos dessa categoria:</strong>
            </div>
            <div id="top-items-container" style="margin-top: 8px;"></div>
          `;
        }
      }
      const categoryCard = createCollapsibleCard("Categoria", categoryCardHTML);
  
      // 7.4 Card: Moeda
      let currencyCardHTML = "<p>Moeda não disponível.</p>";
      if (currencyData) {
        const { id, description, symbol } = currencyData;
        currencyCardHTML = `
          <div class="info-row"><strong>ID:</strong> <span>${id}</span></div>
          <div class="info-row"><strong>Nome:</strong> <span>${description}</span></div>
          <div class="info-row"><strong>Símbolo:</strong> <span>${symbol}</span></div>
        `;
      }
      const currencyCard = createCollapsibleCard("Moeda", currencyCardHTML);
  
      // 7.5 Card: Vendedor
      let sellerCardHTML = "<p>Informações do vendedor não disponíveis.</p>";
      if (sellerData) {
        const { id, nickname, permalink: sellerLink } = sellerData;
        sellerCardHTML = `
          <div class="info-row"><strong>ID do Vendedor:</strong> <span>${id}</span></div>
          <div class="info-row"><strong>Nickname:</strong> <span>${nickname ?? "N/D"}</span></div>
          ${
            sellerLink
              ? `<div class="info-row">
                   <strong>Link:</strong>
                   <a href="${sellerLink}" target="_blank">${sellerLink}</a>
                 </div>`
              : ""
          }
        `;
      }
      const sellerCard = createCollapsibleCard("Vendedor", sellerCardHTML);
  
      // 7.6 Card: Site
      let siteCardHTML = "<p>Informações do site não disponíveis.</p>";
      if (siteData) {
        const { id, name, default_currency_id } = siteData;
        siteCardHTML = `
          <div class="info-row"><strong>ID do Site:</strong> <span>${id}</span></div>
          <div class="info-row"><strong>Nome:</strong> <span>${name}</span></div>
          <div class="info-row"><strong>Moeda Padrão:</strong> <span>${default_currency_id}</span></div>
        `;
      }
      const siteCard = createCollapsibleCard("Site", siteCardHTML);
  
      // Adiciona todos os cards ao content
      contentDiv.appendChild(basicInfoCard);
      contentDiv.appendChild(descriptionCard);
      contentDiv.appendChild(categoryCard);
      contentDiv.appendChild(currencyCard);
      contentDiv.appendChild(sellerCard);
      contentDiv.appendChild(siteCard);
  
      // Se temos topCategoryItems, preenche
      if (topCategoryItems && topCategoryItems.length > 0) {
        const topContainer = document.getElementById("top-items-container");
        if (topContainer) {
          topCategoryItems.forEach((tcItem, idx) => {
            console.log(`>> Preenchendo mini-card #${idx + 1}`, tcItem);
            const miniCard = document.createElement("div");
            miniCard.classList.add("mini-card");
  
            let dateCreatedStr = "N/D";
            if (tcItem.date_created instanceof Date) {
              dateCreatedStr = tcItem.date_created.toLocaleDateString("pt-BR", {
                year: "numeric",
                month: "2-digit",
                day: "2-digit"
              });
            }
  
            let miniGaugeHTML = "";
            if (typeof tcItem.health === "number") {
              console.log(`Gauge do top item #${idx + 1} =>`, tcItem.health);
              miniGaugeHTML = createGaugeHTML(`gauge-top-${tcItem.id}`, tcItem.health);
            } else {
              console.log(`top item #${idx + 1} => health N/D`, tcItem.health);
              miniGaugeHTML = `<p>Health: N/D</p>`;
              // (Opcional) forçar 0:
              // miniGaugeHTML = createGaugeHTML(`gauge-top-${tcItem.id}`, 0);
            }
  
            miniCard.innerHTML = `
              <div class="mini-card-header">
                <strong>#${idx + 1}</strong> - 
                <a href="${tcItem.permalink}" target="_blank">${tcItem.title}</a>
              </div>
              <div class="mini-card-body">
                <p><strong>Preço:</strong> ${tcItem.price}</p>
                <p><strong>Vendidos:</strong> ${tcItem.sold_quantity}</p>
                <p><strong>Frete Grátis?</strong> ${
                  tcItem.free_shipping ? "Sim" : "Não"
                }</p>
                <p><strong>Data de Publicação:</strong> ${dateCreatedStr}</p>
                <p><strong>Média vendida/dia:</strong> ${
                  isNaN(tcItem.avg_sold_per_day)
                    ? "N/D"
                    : tcItem.avg_sold_per_day.toFixed(2)
                }</p>
                <p><strong>Temperatura:</strong> ${tcItem.temperature}</p>
                <p><strong>Saúde (health):</strong></p>
                ${miniGaugeHTML}
              </div>
            `;
  
            topContainer.appendChild(miniCard);
          });
        }
      }
  
      // Ajusta comportamento de clique (expand/colapse)
      setupCollapsibleBehavior();
  
      // Inicializa todos os gauges que foram criados
      console.log("Chamando initAllGauges()...");
      initAllGauges();
    }
  
    // =========================
    // 8. Criação de Cards Colapsáveis
    // =========================
    function createCollapsibleCard(title, innerHTML) {
      const card = document.createElement("div");
      card.classList.add("collapsible-card");
  
      const header = document.createElement("button");
      header.classList.add("card-header");
      header.textContent = title;
  
      const content = document.createElement("div");
      content.classList.add("card-content", "hidden");
      content.innerHTML = innerHTML;
  
      card.appendChild(header);
      card.appendChild(content);
      return card;
    }
  
    function setupCollapsibleBehavior() {
      const headers = document.querySelectorAll(".card-header");
      headers.forEach((header) => {
        header.addEventListener("click", () => {
          const content = header.nextElementSibling;
          if (!content) return;
          content.classList.toggle("hidden");
        });
      });
    }
  
    // =========================
    // 9. Gauge (Velocímetro) - HTML, Inicialização e Update
    // =========================
  
    /**
     * Cria a estrutura HTML do gauge semicírculo
     * @param {string} gaugeId Identificador único
     * @param {number} healthValue Valor de 0 a 1
     * @returns {string} HTML do gauge
     */
    function createGaugeHTML(gaugeId, healthValue) {
      const pct = Math.round(healthValue * 100);
      return `
        <div id="${gaugeId}" class="gauge">
          <div class="gauge__body">
            <div class="gauge__fill"></div>
            <div class="gauge__cover">${pct}%</div>
          </div>
        </div>
      `;
    }
  
    /**
     * Identifica todos os .gauge e seta o valor real
     */
    function initAllGauges() {
      console.log("initAllGauges => Procurando .gauge no DOM...");
      const allGauges = document.querySelectorAll(".gauge");
      allGauges.forEach((gaugeEl) => {
        console.log("Encontrou gaugeEl =>", gaugeEl.id);
        const cover = gaugeEl.querySelector(".gauge__cover");
        const fill = gaugeEl.querySelector(".gauge__fill");
        if (!cover || !fill) {
          console.warn("Gauge sem cover/fill =>", gaugeEl);
          return;
        }
  
        // extrai % do texto
        const text = cover.innerText || "0%";
        let numeric = parseFloat(text.replace("%", "")) / 100;
        if (isNaN(numeric)) numeric = 0;
  
        console.log(` -> setGaugeValue(${gaugeEl.id}, ${numeric})`);
        setGaugeValue(gaugeEl, numeric);
      });
    }
  
    /**
     * Define a rotação e a cor do gauge, baseado no valor (0..1)
     */
    function setGaugeValue(gaugeElement, value) {
      // [0..1]
      value = Math.max(0, Math.min(1, value));
  
      const fill = gaugeElement.querySelector(".gauge__fill");
      const cover = gaugeElement.querySelector(".gauge__cover");
  
      const rotation = value * 180; // semicírculo
      fill.style.transform = `rotate(${rotation}deg)`;
      cover.innerText = `${Math.round(value * 100)}%`;
  
      // Interpolar cor entre #ff0000 (vermelho) e #00cc00 (verde)
      const color = interpolateColor([255, 0, 0], [0, 204, 0], value);
      fill.style.backgroundColor = color;
    }
  
    /**
     * Interpola cor no formato rgb() entre twoRGBStart e twoRGBEnd
     */
    function interpolateColor(startRGB, endRGB, t) {
      const r = Math.round(startRGB[0] + (endRGB[0] - startRGB[0]) * t);
      const g = Math.round(startRGB[1] + (endRGB[1] - startRGB[1]) * t);
      const b = Math.round(startRGB[2] + (endRGB[2] - startRGB[2]) * t);
      return `rgb(${r}, ${g}, ${b})`;
    }
  })();
  