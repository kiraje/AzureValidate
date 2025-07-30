// Vietnamese translations for device auth
const deviceTranslations = {
    en: {
        'device-title': 'Azure Device Authentication',
        'device-subtitle': 'Login with your Azure account and create a service principal automatically',
        'step1-title': 'Step 1: Azure Authentication',
        'step2-title': 'Step 2: Create Service Principal', 
        'step3-title': 'Step 3: Service Principal Created',
        'how-it-works': 'How it works:',
        'step-instructions': '1. Click "Start Device Login" to get a device code<br>2. Open the verification URL in a new tab/window<br>3. Enter the device code and sign in with your Azure account<br>4. We\'ll automatically detect when you\'re authenticated',
        'start-login-btn': 'Start Device Login',
        'back-btn': 'Back',
        'create-sp-btn': 'Create Service Principal',
        'copy-credentials-btn': 'Copy Credentials',
        'validate-btn': 'Validate & Test',
        'sp-name-label': 'Service Principal Name:',
        'role-label': 'Role:',
        'webhook-label': 'Webhook URL (optional):',
        'sp-created-success': '✅ Service Principal Created Successfully',
        'account-info': 'Account Information:'
    },
    vi: {
        'device-title': 'Xác Thực Device Azure',
        'device-subtitle': 'Đăng nhập bằng tài khoản Azure và tự động tạo service principal',
        'step1-title': 'Bước 1: Xác Thực Azure',
        'step2-title': 'Bước 2: Tạo Service Principal',
        'step3-title': 'Bước 3: Service Principal Đã Tạo',
        'how-it-works': 'Cách thức hoạt động:',
        'step-instructions': '1. Nhấp "Bắt Đầu Device Login" để lấy mã thiết bị<br>2. Mở URL xác minh trong tab/cửa sổ mới<br>3. Nhập mã thiết bị và đăng nhập bằng tài khoản Azure<br>4. Chúng tôi sẽ tự động phát hiện khi bạn đã xác thực',
        'start-login-btn': 'Bắt Đầu Device Login',
        'back-btn': 'Quay Lại',
        'create-sp-btn': 'Tạo Service Principal',
        'copy-credentials-btn': 'Sao Chép Thông Tin',
        'validate-btn': 'Xác Thực & Kiểm Tra',
        'sp-name-label': 'Tên Service Principal:',
        'role-label': 'Vai trò:',
        'webhook-label': 'URL Webhook (tuỳ chọn):',
        'sp-created-success': '✅ Service Principal Đã Tạo Thành Công',
        'account-info': 'Thông Tin Tài Khoản:'
    }
};

function updateDeviceLanguage(lang) {
    // Update text content for device auth
    document.querySelectorAll('[data-i18n]').forEach(element => {
        const key = element.getAttribute('data-i18n');
        if (deviceTranslations[lang][key]) {
            element.innerHTML = deviceTranslations[lang][key];
        }
    });
    
    // Save language preference
    localStorage.setItem('azureValidator_language', lang);
}

class DeviceAuthFlow {
    constructor() {
        this.sessionId = null;
        this.pollInterval = null;
        this.servicePrincipal = null;
        this.subscriptionId = null;
        this.currentStep = 1;
        this.currentLang = localStorage.getItem('azureValidator_language') || 'en';
    }

    showError(message) {
        const errorDiv = document.getElementById('errorMessage');
        errorDiv.textContent = message;
        errorDiv.style.display = 'block';
        setTimeout(() => {
            errorDiv.style.display = 'none';
        }, 10000);
    }

    updateStepIndicator(step) {
        // Reset all indicators
        for (let i = 1; i <= 3; i++) {
            const indicator = document.getElementById(`step${i}-indicator`);
            indicator.className = 'step-number';
        }

        // Mark completed steps
        for (let i = 1; i < step; i++) {
            const indicator = document.getElementById(`step${i}-indicator`);
            indicator.className = 'step-number completed';
        }

        // Mark current step
        const currentIndicator = document.getElementById(`step${step}-indicator`);
        currentIndicator.className = 'step-number active';
    }
}

const deviceAuth = new DeviceAuthFlow();

function goToStep(step) {
    // Hide all steps
    document.querySelectorAll('.step').forEach(s => s.classList.remove('active'));
    
    // Show target step
    document.getElementById(`step${step}`).classList.add('active');
    
    // Update indicator
    deviceAuth.updateStepIndicator(step);
    deviceAuth.currentStep = step;
}

async function startDeviceLogin() {
    console.log('startDeviceLogin called');
    const btn = document.getElementById('startLoginBtn');
    console.log('Button found:', btn);
    btn.disabled = true;
    btn.innerHTML = '<div class="loading-spinner"></div>Starting login...';

    try {
        const response = await fetch('/api/device-auth/start', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-API-Key': 'development-api-key'
            }
        });

        const result = await response.json();

        if (!response.ok) {
            throw new Error(result.error || 'Failed to start device login');
        }

        deviceAuth.sessionId = result.session_id;

        // Update UI with device code
        document.getElementById('deviceCode').textContent = result.user_code;
        document.getElementById('verificationUrl').href = result.verification_url;
        document.getElementById('verificationUrl').textContent = result.verification_url;
        document.getElementById('deviceCodeSection').style.display = 'block';

        // Start polling for authentication status
        deviceAuth.pollInterval = setInterval(checkAuthStatus, 3000);

        btn.style.display = 'none';

    } catch (error) {
        deviceAuth.showError('Failed to start device login: ' + error.message);
        btn.disabled = false;
        btn.innerHTML = 'Start Device Login';
    }
}

async function checkAuthStatus() {
    if (!deviceAuth.sessionId) return;

    try {
        const response = await fetch(`/api/device-auth/status/${deviceAuth.sessionId}`, {
            headers: {
                'X-API-Key': 'development-api-key'
            }
        });

        const status = await response.json();

        if (status.status === 'completed') {
            clearInterval(deviceAuth.pollInterval);
            
            // Update account info and go to step 2
            const accountInfo = `${status.account.name} (${status.account.id})`;
            document.getElementById('accountInfo').textContent = accountInfo;
            
            goToStep(2);
        }

    } catch (error) {
        console.error('Error checking auth status:', error);
        deviceAuth.showError('Error checking authentication status');
    }
}

async function createServicePrincipal() {
    const btn = document.getElementById('createSpBtn');
    const name = document.getElementById('spName').value;
    const role = document.getElementById('spRole').value;

    btn.disabled = true;
    btn.innerHTML = '<div class="loading-spinner"></div>Creating...';

    try {
        const response = await fetch(`/api/device-auth/create-sp/${deviceAuth.sessionId}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-API-Key': 'development-api-key'
            },
            body: JSON.stringify({ name, role })
        });

        const result = await response.json();

        if (!response.ok) {
            throw new Error(result.error || 'Failed to create service principal');
        }

        // Store SP details
        deviceAuth.servicePrincipal = result.service_principal;
        deviceAuth.subscriptionId = result.subscription_id;

        // Update UI
        document.getElementById('spAppId').textContent = result.service_principal.appId;
        document.getElementById('spDisplayName').textContent = result.service_principal.displayName;
        document.getElementById('spTenant').textContent = result.service_principal.tenant;
        document.getElementById('spSubscription').textContent = result.subscription_id;
        document.getElementById('spPassword').textContent = result.service_principal.password;

        // Load saved webhook URL
        const savedUrl = localStorage.getItem('azureValidator_webhookUrl');
        if (savedUrl) {
            document.getElementById('webhookUrl').value = savedUrl;
        }

        goToStep(3);

    } catch (error) {
        deviceAuth.showError('Failed to create service principal: ' + error.message);
        btn.disabled = false;
        btn.innerHTML = 'Create Service Principal';
    }
}

async function validateServicePrincipal() {
    const btn = document.getElementById('validateBtn');
    const webhookUrl = document.getElementById('webhookUrl').value;

    // Save webhook URL
    if (webhookUrl) {
        localStorage.setItem('azureValidator_webhookUrl', webhookUrl);
    }

    btn.disabled = true;
    btn.innerHTML = '<div class="loading-spinner"></div>Starting Validation...';

    try {
        const response = await fetch(`/api/device-auth/validate/${deviceAuth.sessionId}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-API-Key': 'development-api-key'
            },
            body: JSON.stringify({
                webhook_url: webhookUrl || undefined,
                test_config: {
                    resource_group: 'validation-test-rg',
                    location: 'eastus',
                    test_files: ['index.html', '404.html']
                }
            })
        });

        const result = await response.json();

        if (!response.ok) {
            throw new Error(result.error || 'Failed to start validation');
        }

        // Redirect to main validation page with the validation ID
        const validationUrl = `/?validation_id=${result.validation_id}&auto_fill=true`;
        window.location.href = validationUrl;

    } catch (error) {
        deviceAuth.showError('Failed to start validation: ' + error.message);
        btn.disabled = false;
        btn.innerHTML = 'Validate & Test';
    }
}

function copyCredentials() {
    if (!deviceAuth.servicePrincipal) {
        deviceAuth.showError('No service principal to copy');
        return;
    }

    const credentials = {
        appId: deviceAuth.servicePrincipal.appId,
        displayName: deviceAuth.servicePrincipal.displayName,
        password: deviceAuth.servicePrincipal.password,
        tenant: deviceAuth.servicePrincipal.tenant
    };

    const credentialsText = JSON.stringify(credentials, null, 2);

    navigator.clipboard.writeText(credentialsText).then(() => {
        // Show temporary success message
        const btn = event.target;
        const originalText = btn.textContent;
        btn.textContent = 'Copied!';
        btn.style.background = '#27ae60';
        setTimeout(() => {
            btn.textContent = originalText;
            btn.style.background = '';
        }, 2000);
    }).catch(() => {
        deviceAuth.showError('Failed to copy to clipboard');
    });
}

// Auto-fill main form if redirected from device auth
window.addEventListener('DOMContentLoaded', () => {
    // Initialize language for device auth
    const currentLang = localStorage.getItem('azureValidator_language') || 'en';
    const languageSelectDevice = document.getElementById('languageSelectDevice');
    
    if (languageSelectDevice) {
        languageSelectDevice.value = currentLang;
        updateDeviceLanguage(currentLang);
        
        languageSelectDevice.addEventListener('change', (e) => {
            updateDeviceLanguage(e.target.value);
        });
    }

    // Add event listeners
    const startLoginBtn = document.getElementById('startLoginBtn');
    if (startLoginBtn) {
        startLoginBtn.addEventListener('click', startDeviceLogin);
    }

    const backToStep1Btn = document.getElementById('backToStep1Btn');
    if (backToStep1Btn) {
        backToStep1Btn.addEventListener('click', () => goToStep(1));
    }

    const createSpBtn = document.getElementById('createSpBtn');
    if (createSpBtn) {
        createSpBtn.addEventListener('click', createServicePrincipal);
    }

    const backToStep2Btn = document.getElementById('backToStep2Btn');
    if (backToStep2Btn) {
        backToStep2Btn.addEventListener('click', () => goToStep(2));
    }

    const copyCredentialsBtn = document.getElementById('copyCredentialsBtn');
    if (copyCredentialsBtn) {
        copyCredentialsBtn.addEventListener('click', copyCredentials);
    }

    const validateBtn = document.getElementById('validateBtn');
    if (validateBtn) {
        validateBtn.addEventListener('click', validateServicePrincipal);
    }

    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('auto_fill') === 'true' && urlParams.get('validation_id')) {
        // This would be handled by the main page
        console.log('Redirected from device auth with validation ID:', urlParams.get('validation_id'));
    }
});