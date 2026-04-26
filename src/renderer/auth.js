export class AuthController {
    overlay = null;
    constructor() {
        this.overlay = document.getElementById('authOverlay');
    }
    async login() {
        const username = document.getElementById('loginUsername')?.value;
        const password = document.getElementById('loginPassword')?.value;
        if (!username || !password)
            return alert('Please fill all fields');
        try {
            const res = await window.electronAPI.login({ username, password });
            if (res.ok) {
                window.state.user = res.user;
                localStorage.setItem('nd_user', JSON.stringify(res.user));
                this.hide();
                // Trigger app init
                window.location.reload();
            }
            else {
                alert(res.error);
            }
        }
        catch (err) {
            console.error(err);
        }
    }
    async signup() {
        const username = document.getElementById('signupUsername')?.value;
        const password = document.getElementById('signupPassword')?.value;
        const email = document.getElementById('signupEmail')?.value;
        if (!username || !password)
            return alert('Please fill all fields');
        try {
            const res = await window.electronAPI.signup({ username, password, email });
            if (res.ok) {
                window.state.user = res.user;
                localStorage.setItem('nd_user', JSON.stringify(res.user));
                this.hide();
                window.location.reload();
            }
            else {
                alert(res.error);
            }
        }
        catch (err) {
            console.error(err);
        }
    }
    show() {
        if (this.overlay)
            this.overlay.style.display = 'flex';
    }
    hide() {
        if (this.overlay)
            this.overlay.style.display = 'none';
    }
    logout() {
        window.state.user = null;
        localStorage.removeItem('nd_user');
        this.show();
    }
}
export const authController = new AuthController();
