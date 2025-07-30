// Translation system
const translations = {
    en: {
        'title': 'Azure Service Principal Validator',
        'subtitle': 'Test your Azure credentials with comprehensive permission validation',
        'device-auth-link': '🔐 Create Service Principal with Device Login',
        'sp-json-label': 'Service Principal JSON',
        'sp-json-placeholder': '{"appId": "...", "displayName": "...", "password": "...", "tenant": "..."}',
        'sp-json-help': 'Paste your complete service principal JSON (all 4 fields)',
        'subscription-id-label': 'Subscription ID',
        'subscription-id-placeholder': 'abcdef01-2345-6789-abcd-ef0123456789',
        'webhook-url-label': 'Webhook URL',
        'webhook-url-placeholder': 'https://your-app.com/webhook/azure-validation',
        'validate-btn': 'Validate Credentials',
        'validating': 'Validating credentials...',
        'perm-auth': 'Azure Authentication',
        'perm-rg': 'Resource Group Creation',
        'perm-storage': 'Storage Account Creation',
        'perm-container': 'Blob Container Creation',
        'perm-upload': 'File Upload',
        'perm-website': 'Static Website Configuration',
        'perm-cleanup': 'Resource Cleanup',
        'validation-complete': 'Validation Complete',
        'validation-failed': 'Validation Failed',
        'webhook-sent': 'Webhook notification sent successfully',
        'webhook-failed': 'Failed to send webhook notification'
    },
    vi: {
        'title': 'Trình Xác Thực Service Principal Azure',
        'subtitle': 'Kiểm tra thông tin đăng nhập Azure với xác thực quyền toàn diện',
        'device-auth-link': '🔐 Tạo Service Principal bằng Device Login',
        'sp-json-label': 'JSON Service Principal',
        'sp-json-placeholder': '{"appId": "...", "displayName": "...", "password": "...", "tenant": "..."}',
        'sp-json-help': 'Dán JSON service principal đầy đủ (cả 4 trường)',
        'subscription-id-label': 'ID Subscription',
        'subscription-id-placeholder': 'abcdef01-2345-6789-abcd-ef0123456789',
        'webhook-url-label': 'URL Webhook',
        'webhook-url-placeholder': 'https://ung-dung-cua-ban.com/webhook/azure-validation',
        'validate-btn': 'Xác Thực Thông Tin',
        'validating': 'Đang xác thực thông tin...',
        'perm-auth': 'Xác Thực Azure',
        'perm-rg': 'Tạo Resource Group',
        'perm-storage': 'Tạo Storage Account',
        'perm-container': 'Tạo Blob Container',
        'perm-upload': 'Tải File Lên',
        'perm-website': 'Cấu Hình Static Website',
        'perm-cleanup': 'Dọn Dẹp Tài Nguyên',
        'validation-complete': 'Xác Thực Hoàn Tất',
        'validation-failed': 'Xác Thực Thất Bại',
        'webhook-sent': 'Đã gửi thông báo webhook thành công',
        'webhook-failed': 'Gửi thông báo webhook thất bại'
    }
};

function updateLanguage(lang) {
    // Update text content
    document.querySelectorAll('[data-i18n]').forEach(element => {
        const key = element.getAttribute('data-i18n');
        if (translations[lang][key]) {
            element.textContent = translations[lang][key];
        }
    });

    // Update placeholders
    document.querySelectorAll('[data-i18n-placeholder]').forEach(element => {
        const key = element.getAttribute('data-i18n-placeholder');
        if (translations[lang][key]) {
            element.placeholder = translations[lang][key];
        }
    });

    // Save language preference
    localStorage.setItem('azureValidator_language', lang);
}

class AzureValidator {
    constructor() {
        this.validationId = null;
        this.pollInterval = null;
        this.currentLang = localStorage.getItem('azureValidator_language') || 'en';
        this.init();
    }

    init() {
        // Initialize language
        const languageSelect = document.getElementById('languageSelect');
        languageSelect.value = this.currentLang;
        updateLanguage(this.currentLang);
        
        // Language selector event
        languageSelect.addEventListener('change', (e) => {
            this.currentLang = e.target.value;
            updateLanguage(this.currentLang);
        });

        const form = document.getElementById('validationForm');
        form.addEventListener('submit', (e) => this.handleSubmit(e));
        
        // Add focus styling for textarea
        const textarea = document.getElementById('servicePrincipalJson');
        textarea.addEventListener('focus', () => {
            textarea.style.borderColor = '#667eea';
        });
        textarea.addEventListener('blur', () => {
            textarea.style.borderColor = '#e1e8ed';
        });

        // Restore saved webhook URL
        this.loadSavedWebhookUrl();
        
        // Save webhook URL on change
        const webhookInput = document.getElementById('webhookUrl');
        webhookInput.addEventListener('input', () => {
            localStorage.setItem('azureValidator_webhookUrl', webhookInput.value);
        });
    }

    async handleSubmit(e) {
        e.preventDefault();
        
        const formData = new FormData(e.target);
        const servicePrincipalJsonText = formData.get('servicePrincipalJson');
        const subscriptionId = formData.get('subscriptionId');
        const webhookUrl = formData.get('webhookUrl');

        // Parse service principal JSON
        let servicePrincipal;
        try {
            servicePrincipal = JSON.parse(servicePrincipalJsonText);
        } catch (error) {
            alert('Invalid JSON format. Please check your service principal JSON.\n\nExpected format:\n{\n  "appId": "your-app-id",\n  "displayName": "your-display-name",\n  "password": "your-password",\n  "tenant": "your-tenant-id"\n}');
            return;
        }

        // Validate required fields
        if (!servicePrincipal.appId || !servicePrincipal.password || !servicePrincipal.tenant) {
            alert('Service principal JSON missing required fields. Must include: appId, password, tenant');
            return;
        }

        // Map to API format
        const credentials = {
            tenant_id: servicePrincipal.tenant,
            client_id: servicePrincipal.appId,
            client_secret: servicePrincipal.password,
            display_name: servicePrincipal.displayName || ''
        };

        this.startValidation(credentials, subscriptionId, webhookUrl);
    }

    async startValidation(credentials, subscriptionId, webhookUrl) {
        this.showStatus();
        this.setLoading(true);
        this.resetPermissions();

        const payload = {
            credentials,
            subscription_id: subscriptionId,
            test_config: {
                resource_group: 'validation-test-rg',
                location: 'eastus',
                test_files: ['index.html', '404.html']
            }
        };

        if (webhookUrl) {
            payload.webhook_url = webhookUrl;
        }

        try {
            const response = await fetch('/api/validate', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-API-Key': 'development-api-key'
                },
                body: JSON.stringify(payload)
            });

            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.error || 'Validation failed to start');
            }

            this.validationId = result.validation_id;
            this.startPolling();

        } catch (error) {
            this.showError('Failed to start validation: ' + error.message);
            this.setLoading(false);
        }
    }

    startPolling() {
        this.pollInterval = setInterval(() => {
            this.checkStatus();
        }, 2000);
    }

    async checkStatus() {
        if (!this.validationId) return;

        try {
            const response = await fetch(`/api/validate/${this.validationId}/status`, {
                headers: {
                    'X-API-Key': 'development-api-key'
                }
            });

            const status = await response.json();

            if (status.status === 'valid' || status.status === 'invalid' || status.status === 'failed') {
                clearInterval(this.pollInterval);
                await this.getDetailedReport();
            }

        } catch (error) {
            console.error('Error checking status:', error);
        }
    }

    async getDetailedReport() {
        try {
            const response = await fetch(`/api/validate/${this.validationId}/report`, {
                headers: {
                    'X-API-Key': 'development-api-key'
                }
            });

            const report = await response.json();
            this.displayResults(report);

        } catch (error) {
            this.showError('Failed to get validation report: ' + error.message);
        }
    }

    displayResults(report) {
        this.setLoading(false);
        
        const isValid = report.report && report.report.isValid;
        const statusIcon = document.getElementById('statusIcon');
        const statusText = document.getElementById('statusText');

        if (isValid) {
            statusIcon.className = 'status-icon success';
            statusIcon.textContent = '✓';
            statusText.textContent = translations[this.currentLang]['validation-complete'];
            statusText.style.color = '#27ae60';
        } else {
            statusIcon.className = 'status-icon error';
            statusIcon.textContent = '✗';
            statusText.textContent = translations[this.currentLang]['validation-failed'];
            statusText.style.color = '#e74c3c';
        }

        // Update permission checks
        if (report.report && report.report.permissions) {
            this.updatePermissions(report.report.permissions);
        }

        // Show errors if any
        if (report.report && report.report.errors && report.report.errors.length > 0) {
            this.showErrorDetails(report.report.errors);
        }

        // Show webhook status
        if (report.report && report.report.webhook_sent) {
            this.showWebhookStatus(true);
        }

        // Show created resources info
        if (report.report && report.report.storageAccountName) {
            this.showResourceInfo(report.report);
        }
    }

    updatePermissions(permissions) {
        const permissionMap = {
            'resource_group_create': 'perm-rg',
            'storage_account_create': 'perm-storage', 
            'blob_container_create': 'perm-container',
            'blob_upload': 'perm-upload',
            'static_website_enable': 'perm-website',
            'storage_account_delete': 'perm-cleanup'
        };

        // Always show auth as success if we got this far
        const authIcon = document.getElementById('perm-auth');
        authIcon.className = 'permission-icon success';
        authIcon.textContent = '✓';

        Object.entries(permissions).forEach(([permission, success]) => {
            const iconId = permissionMap[permission];
            if (iconId) {
                const icon = document.getElementById(iconId);
                if (success) {
                    icon.className = 'permission-icon success';
                    icon.textContent = '✓';
                } else {
                    icon.className = 'permission-icon error';
                    icon.textContent = '✗';
                }
            }
        });
    }

    showErrorDetails(errors) {
        const errorDetails = document.getElementById('errorDetails');
        errorDetails.innerHTML = '<strong>Errors:</strong><br>' + 
            errors.map(error => `• ${error}`).join('<br>');
        errorDetails.style.display = 'block';
    }

    showWebhookStatus(success) {
        const webhookSection = document.getElementById('webhookSection');
        if (success) {
            webhookSection.className = 'webhook-section success';
            webhookSection.innerHTML = '✓ Webhook notification sent successfully';
        } else {
            webhookSection.innerHTML = '⚠ Webhook notification failed';
        }
        webhookSection.style.display = 'block';
    }

    showResourceInfo(report) {
        const webhookSection = document.getElementById('webhookSection');
        let content = webhookSection.innerHTML || '';
        
        if (report.storageAccountName) {
            content += `<br><strong>Storage Account:</strong> ${report.storageAccountName}`;
        }
        
        if (report.websiteUrl) {
            content += `<br><strong>Website URL:</strong> <a href="${report.websiteUrl}" target="_blank">${report.websiteUrl}</a>`;
        }
        
        webhookSection.innerHTML = content;
        webhookSection.style.display = 'block';
    }

    resetPermissions() {
        const permissionIcons = document.querySelectorAll('.permission-icon');
        permissionIcons.forEach(icon => {
            icon.className = 'permission-icon pending';
            icon.textContent = '•';
        });
    }

    showStatus() {
        const statusSection = document.getElementById('statusSection');
        statusSection.classList.add('show');
        
        const statusIcon = document.getElementById('statusIcon');
        const statusText = document.getElementById('statusText');
        
        statusIcon.className = 'status-icon pending';
        statusIcon.textContent = '⏳';
        statusText.textContent = 'Validating credentials...';
        statusText.style.color = '#2c3e50';

        // Hide previous results
        document.getElementById('errorDetails').style.display = 'none';
        document.getElementById('webhookSection').style.display = 'none';
    }

    setLoading(loading) {
        const btn = document.getElementById('validateBtn');
        
        if (loading) {
            btn.disabled = true;
            btn.innerHTML = '<div class="loading-spinner"></div>Validating...';
        } else {
            btn.disabled = false;
            btn.innerHTML = 'Validate Credentials';
        }
    }

    showError(message) {
        const statusSection = document.getElementById('statusSection');
        statusSection.classList.add('show');
        
        const statusIcon = document.getElementById('statusIcon');
        const statusText = document.getElementById('statusText');
        
        statusIcon.className = 'status-icon error';
        statusIcon.textContent = '✗';
        statusText.textContent = 'Validation Error';
        statusText.style.color = '#e74c3c';

        const errorDetails = document.getElementById('errorDetails');
        errorDetails.textContent = message;
        errorDetails.style.display = 'block';
    }

    loadSavedWebhookUrl() {
        const savedUrl = localStorage.getItem('azureValidator_webhookUrl');
        if (savedUrl) {
            document.getElementById('webhookUrl').value = savedUrl;
        }
    }
}

// Initialize the validator when the page loads
document.addEventListener('DOMContentLoaded', () => {
    new AzureValidator();
});