// Modal Management
const ModalManager = (() => {
    function showModal(title, message, callback) {
        const overlay = document.getElementById('modalOverlay');
        const header = document.getElementById('modalHeader');
        const body = document.getElementById('modalBody');
        const footer = document.getElementById('modalFooter');

        header.textContent = title;
        body.textContent = message;

        if (callback) {
            footer.innerHTML = `
                <button class="modal-btn modal-btn-secondary" onclick="closeModal()">Cancel</button>
                <button class="modal-btn modal-btn-primary" onclick="window.modalCallback(); closeModal();">Confirm</button>
            `;
            window.modalCallback = callback;
        } else {
            footer.innerHTML = '<button class="modal-btn modal-btn-primary" onclick="closeModal()">OK</button>';
        }

        overlay.classList.add('active');
    }

    function closeModal() {
        const overlay = document.getElementById('modalOverlay');
        overlay.classList.remove('active');
        window.modalCallback = null;
    }

    function showConfirmModal(title, message, onConfirm, onCancel) {
        const overlay = document.getElementById('modalOverlay');
        const header = document.getElementById('modalHeader');
        const body = document.getElementById('modalBody');
        const footer = document.getElementById('modalFooter');

        header.textContent = title;
        body.textContent = message;

        footer.innerHTML = `
            <button class="modal-btn modal-btn-secondary" onclick="window.modalCancelCallback(); closeModal()">Cancel</button>
            <button class="modal-btn modal-btn-primary" onclick="window.modalConfirmCallback(); closeModal();">Confirm</button>
        `;

        window.modalConfirmCallback = onConfirm || (() => {});
        window.modalCancelCallback = onCancel || (() => {});

        overlay.classList.add('active');
    }

    return {
        showModal,
        closeModal,
        showConfirmModal
    };
})();

// Export to global scope
window.showModal = ModalManager.showModal;
window.closeModal = ModalManager.closeModal;
window.showConfirmModal = ModalManager.showConfirmModal;
