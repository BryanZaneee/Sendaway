import { authService } from '../services/auth.service';
import { videoService } from '../services/video.service';
import { validateForm, getDateMonthsFromNow } from '../utils/validation';
import { validateVideo, formatDuration } from '../utils/video-duration';
import { authModal } from './auth-modal';
import { planModal } from './plan-modal';
import { toast } from './toast';

interface FormElements {
  form: HTMLFormElement;
  messageInput: HTMLTextAreaElement;
  charCount: HTMLElement;
  videoInput: HTMLInputElement;
  fileNameDisplay: HTMLElement;
  dateInput: HTMLInputElement;
  emailInput: HTMLInputElement;
  sendBtn: HTMLButtonElement;
  chips: NodeListOf<HTMLElement>;
}

class FormHandler {
  private elements: FormElements | null = null;
  private uploadedVideo: {
    path: string;
    size: number;
    duration: number;
  } | null = null;

  /**
   * Initialize the form handler
   */
  init(): void {
    this.elements = {
      form: document.getElementById('capsuleForm') as HTMLFormElement,
      messageInput: document.getElementById('messageInput') as HTMLTextAreaElement,
      charCount: document.getElementById('charCount') as HTMLElement,
      videoInput: document.getElementById('videoInput') as HTMLInputElement,
      fileNameDisplay: document.getElementById('fileName') as HTMLElement,
      dateInput: document.getElementById('dateInput') as HTMLInputElement,
      emailInput: document.getElementById('emailInput') as HTMLInputElement,
      sendBtn: document.getElementById('sendBtn') as HTMLButtonElement,
      chips: document.querySelectorAll('.chip') as NodeListOf<HTMLElement>
    };

    if (!this.elements.form) {
      console.error('Form not found');
      return;
    }

    this.setupEventListeners();
    this.prefillEmailIfLoggedIn();
  }

  private setupEventListeners(): void {
    const el = this.elements!;

    // Character count
    el.messageInput.addEventListener('input', () => {
      el.charCount.textContent = el.messageInput.value.length.toString();
    });

    // Video file selection
    el.videoInput.addEventListener('change', (e) => this.handleVideoSelect(e));

    // Date preset chips
    el.chips.forEach(chip => {
      chip.addEventListener('click', () => {
        const months = parseInt(chip.dataset.months || chip.textContent?.match(/\d+/)?.[0] || '0');
        this.setPresetDate(months, chip);
      });
    });

    // Also handle inline onclick (from original HTML)
    (window as unknown as { setPresetDate: (months: number, btn: HTMLElement) => void }).setPresetDate =
      (months: number, btn: HTMLElement) => this.setPresetDate(months, btn);

    // Form submission
    el.sendBtn.addEventListener('click', (e) => {
      e.preventDefault();
      this.handleSubmit();
    });
  }

  private prefillEmailIfLoggedIn(): void {
    const profile = authService.getProfile();
    if (profile && this.elements) {
      this.elements.emailInput.value = profile.email;
    }

    // Update when auth state changes
    authService.onAuthStateChange((state) => {
      if (state.profile && this.elements && !this.elements.emailInput.value) {
        this.elements.emailInput.value = state.profile.email;
      }
    });
  }

  private setPresetDate(months: number, btn: HTMLElement): void {
    if (!this.elements) return;

    this.elements.dateInput.value = getDateMonthsFromNow(months);

    // Update chip UI
    this.elements.chips.forEach(c => c.classList.remove('active'));
    btn.classList.add('active');
  }

  private async handleVideoSelect(e: Event): Promise<void> {
    const el = this.elements!;
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];

    if (!file) {
      el.fileNameDisplay.style.display = 'none';
      this.uploadedVideo = null;
      return;
    }

    // Check if user is logged in and pro
    if (!authService.isLoggedIn()) {
      toast.info('Sign in to upload videos');
      input.value = '';
      return;
    }

    if (!authService.isPro()) {
      toast.info('Video uploads are available for Pro users. Upgrade after filling out your message.');
      // Keep the file selected but don't upload yet
      el.fileNameDisplay.textContent = `Selected: ${file.name} (will upload after Pro upgrade)`;
      el.fileNameDisplay.style.display = 'block';
      return;
    }

    // Validate video
    const remainingStorage = authService.getRemainingStorage();
    const validation = await validateVideo(file, remainingStorage);

    if (!validation.valid) {
      toast.error(validation.error || 'Invalid video');
      input.value = '';
      el.fileNameDisplay.style.display = 'none';
      return;
    }

    // Show uploading state
    el.fileNameDisplay.textContent = 'Uploading video...';
    el.fileNameDisplay.style.display = 'block';
    el.sendBtn.disabled = true;

    // Upload video
    const result = await videoService.uploadVideo(file);

    if (!result.success) {
      toast.error(result.error || 'Upload failed');
      input.value = '';
      el.fileNameDisplay.style.display = 'none';
      el.sendBtn.disabled = false;
      return;
    }

    this.uploadedVideo = {
      path: result.path!,
      size: result.size!,
      duration: result.duration!
    };

    el.fileNameDisplay.textContent = `Uploaded: ${file.name} (${formatDuration(result.duration!)})`;
    el.fileNameDisplay.style.display = 'block';
    el.sendBtn.disabled = false;

    toast.success('Video uploaded successfully');
  }

  private async handleSubmit(): Promise<void> {
    const el = this.elements!;

    // Reset validation styles
    [el.messageInput, el.dateInput, el.emailInput].forEach(input => {
      input.style.borderColor = 'black';
    });

    // Validate form
    const validation = validateForm(
      el.messageInput.value,
      el.dateInput.value,
      el.emailInput.value
    );

    if (!validation.valid) {
      if (validation.errors.message) {
        el.messageInput.style.borderColor = 'red';
      }
      if (validation.errors.date) {
        el.dateInput.style.borderColor = 'red';
      }
      if (validation.errors.email) {
        el.emailInput.style.borderColor = 'red';
      }

      const firstError = validation.errors.message || validation.errors.date || validation.errors.email;
      toast.error(firstError || 'Please check the highlighted fields');
      return;
    }

    // Check if logged in
    if (!authService.isLoggedIn()) {
      // Show auth modal, then continue after login
      authModal.show(() => {
        // After successful login, continue with submission
        this.handleSubmit();
      });
      return;
    }

    // Check if free user trying to attach video
    const hasVideoSelected = el.videoInput.files && el.videoInput.files.length > 0;
    const hasVideoUploaded = this.uploadedVideo !== null;

    // Prepare message data
    const messageData = {
      messageText: el.messageInput.value.trim(),
      scheduledDate: el.dateInput.value,
      deliveryEmail: el.emailInput.value.trim(),
      videoStoragePath: this.uploadedVideo?.path,
      videoSizeBytes: this.uploadedVideo?.size,
      videoDurationSeconds: this.uploadedVideo?.duration
    };

    // Show plan modal
    planModal.show({
      messageData,
      hasVideo: hasVideoSelected || hasVideoUploaded,
      onSuccess: () => this.resetForm()
    });
  }

  private resetForm(): void {
    const el = this.elements!;

    el.form.reset();
    el.charCount.textContent = '0';
    el.fileNameDisplay.style.display = 'none';
    el.chips.forEach(c => c.classList.remove('active'));
    this.uploadedVideo = null;

    // Re-prefill email if logged in
    this.prefillEmailIfLoggedIn();
  }
}

export const formHandler = new FormHandler();
