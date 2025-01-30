document.addEventListener("DOMContentLoaded", () => {
    const startBtn = document.getElementById("start-btn");
  
    startBtn.addEventListener("click", async () => {
      // Envia mensagem para o content_script pedindo para abrir o modal e buscar informações
      chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
        chrome.tabs.sendMessage(tabs[0].id, { action: "START_ML_MODAL" });
      });
    });
  });
  