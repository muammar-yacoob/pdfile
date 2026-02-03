// Share Modal Functionality
const ShareModal = (() => {
    const APP_URL = 'https://pdfile.co';
    const APP_TITLE = 'PDFile';
    const APP_SHARE_MESSAGE = 'Check out PDFile – Free PDF utility toolkit that works right in your browser!';

    const socialShareUrls = {
        twitter: () => `https://twitter.com/intent/tweet?text=${encodeURIComponent(APP_SHARE_MESSAGE)}&url=${encodeURIComponent(APP_URL)}`,
        facebook: () => `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(APP_URL)}`,
        linkedin: () => `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(APP_URL)}`,
        reddit: () => `https://reddit.com/submit?url=${encodeURIComponent(APP_URL)}&title=${encodeURIComponent(APP_SHARE_MESSAGE)}`,
        whatsapp: () => `https://wa.me/?text=${encodeURIComponent(`${APP_SHARE_MESSAGE}\n${APP_URL}`)}`,
        telegram: () => `https://t.me/share/url?url=${encodeURIComponent(APP_URL)}&text=${encodeURIComponent(APP_SHARE_MESSAGE)}`,
        email: () => `mailto:?subject=${encodeURIComponent(`Check out ${APP_TITLE}`)}&body=${encodeURIComponent(`${APP_SHARE_MESSAGE}\n\n${APP_URL}`)}`
    };

    function show() {
        const modal = document.getElementById('shareModal');
        modal.classList.add('active');
    }

    function close() {
        const modal = document.getElementById('shareModal');
        modal.classList.remove('active');
    }

    function handleSocialShare(platform) {
        const url = socialShareUrls[platform]();
        window.open(url, '_blank', 'noopener,noreferrer,width=600,height=400');
        close();
    }

    async function handleCopyLink() {
        try {
            await navigator.clipboard.writeText(APP_URL);
            if (window.showModal) {
                window.showModal('Success', 'Link copied to clipboard!');
            }
            close();
        } catch (error) {
            if (window.showModal) {
                window.showModal('Error', 'Failed to copy link. Please try again.');
            }
        }
    }

    function handleEmailShare() {
        window.location.href = socialShareUrls.email();
        close();
    }

    function init() {
        // Close share modal when clicking outside
        document.addEventListener('click', (e) => {
            const modal = document.getElementById('shareModal');
            if (e.target === modal) {
                close();
            }
        });
    }

    return {
        show,
        close,
        handleSocialShare,
        handleCopyLink,
        handleEmailShare,
        init
    };
})();
