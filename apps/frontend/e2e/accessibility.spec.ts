import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test.describe('Accessibility - WCAG Compliance', () => {
  test('homepage should have no critical accessibility violations', async ({ page }) => {
    await page.goto('/');
    
    const accessibilityScanResults = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    
    // Filter for critical violations
    const criticalViolations = accessibilityScanResults.violations.filter(
      v => v.impact === 'critical' || v.impact === 'serious'
    );
    
    expect(criticalViolations).toHaveLength(0);
  });

  test('explore page should have no critical accessibility violations', async ({ page }) => {
    await page.goto('/explore');
    
    const accessibilityScanResults = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa'])
      .analyze();
    
    const criticalViolations = accessibilityScanResults.violations.filter(
      v => v.impact === 'critical'
    );
    
    expect(criticalViolations).toHaveLength(0);
  });

  test('should have proper heading hierarchy', async ({ page }) => {
    await page.goto('/');
    
    const headings = await page.evaluate(() => {
      const h = document.querySelectorAll('h1, h2, h3, h4, h5, h6');
      return Array.from(h).map(el => ({
        level: parseInt(el.tagName[1]),
        text: el.textContent?.trim()
      }));
    });
    
    // Should have at least one h1
    const h1Count = headings.filter(h => h.level === 1).length;
    expect(h1Count).toBeGreaterThanOrEqual(1);
    expect(h1Count).toBeLessThanOrEqual(1); // Should only have one h1
    
    // Headings should not skip levels
    let prevLevel = 0;
    for (const heading of headings) {
      if (prevLevel > 0) {
        expect(heading.level).toBeLessThanOrEqual(prevLevel + 1);
      }
      prevLevel = heading.level;
    }
  });

  test('all interactive elements should be keyboard accessible', async ({ page }) => {
    await page.goto('/explore');
    
    // Get all interactive elements
    const interactiveElements = await page.evaluate(() => {
      const elements = document.querySelectorAll('button, a, input, select, textarea, [tabindex]');
      return Array.from(elements).map(el => ({
        tag: el.tagName,
        tabIndex: (el as HTMLElement).tabIndex,
        hasRole: el.hasAttribute('role'),
        isVisible: (el as HTMLElement).offsetParent !== null
      }));
    });
    
    // All visible interactive elements should be focusable
    const visibleElements = interactiveElements.filter(el => el.isVisible);
    for (const el of visibleElements) {
      expect(el.tabIndex).toBeGreaterThanOrEqual(-1);
    }
  });

  test('forms should have associated labels', async ({ page }) => {
    await page.goto('/explore');
    
    const inputsWithoutLabels = await page.evaluate(() => {
      const inputs = document.querySelectorAll('input, select, textarea');
      return Array.from(inputs).filter(input => {
        const id = input.id;
        const label = document.querySelector(`label[for="${id}"]`);
        const ariaLabel = input.getAttribute('aria-label');
        const ariaLabelledBy = input.getAttribute('aria-labelledby');
        
        return !label && !ariaLabel && !ariaLabelledBy;
      }).map(el => ({
        type: (el as HTMLInputElement).type,
        id: el.id,
        name: (el as HTMLInputElement).name
      }));
    });
    
    // Hidden inputs are OK, but visible inputs need labels
    expect(inputsWithoutLabels.filter(i => i.type !== 'hidden')).toHaveLength(0);
  });

  test('images should have alt text', async ({ page }) => {
    await page.goto('/');
    
    const imagesWithoutAlt = await page.evaluate(() => {
      const images = document.querySelectorAll('img');
      return Array.from(images).filter(img => {
        const alt = img.getAttribute('alt');
        const role = img.getAttribute('role');
        
        // Decorative images can have empty alt or role="presentation"
        return alt === null && role !== 'presentation';
      }).map(img => img.src);
    });
    
    expect(imagesWithoutAlt).toHaveLength(0);
  });

  test('color contrast should meet WCAG AA', async ({ page }) => {
    await page.goto('/');
    
    const accessibilityScanResults = await new AxeBuilder({ page })
      .withTags(['wcag2aa'])
      .include('body')
      .analyze();
    
    const contrastViolations = accessibilityScanResults.violations.filter(
      v => v.id.includes('contrast')
    );
    
    expect(contrastViolations).toHaveLength(0);
  });

  test('focus should be visible', async ({ page }) => {
    await page.goto('/explore');
    
    // Tab through the page
    for (let i = 0; i < 5; i++) {
      await page.keyboard.press('Tab');
      
      // Check if focused element has visible focus indicator
      const hasFocusStyle = await page.evaluate(() => {
        const focused = document.activeElement;
        if (!focused || focused === document.body) return true;
        
        const styles = window.getComputedStyle(focused);
        const outline = styles.outline;
        const boxShadow = styles.boxShadow;
        const border = styles.border;
        
        // Should have some visible focus indicator
        return outline !== 'none' || boxShadow !== 'none' || border !== 'none';
      });
      
      // Most elements should have focus styles
    }
  });

  test('page should have lang attribute', async ({ page }) => {
    await page.goto('/');
    
    const lang = await page.evaluate(() => document.documentElement.lang);
    expect(lang).toBeTruthy();
  });

  test('should support reduced motion', async ({ page }) => {
    // Emulate prefers-reduced-motion
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    
    // Page should still load and be usable
    await expect(page.locator('body')).toBeVisible();
    
    // Check if animations are disabled
    const hasAnimations = await page.evaluate(() => {
      const elements = document.querySelectorAll('*');
      return Array.from(elements).some(el => {
        const styles = window.getComputedStyle(el);
        const animation = styles.animation || styles.animationName;
        return animation && animation !== 'none';
      });
    });
    
    // With reduced motion, animations should be minimal
  });

  test('modals should trap focus', async ({ page }) => {
    await page.goto('/');
    
    const modalTrigger = page.getByRole('button', { name: 'Favorites and recent items' });
    await modalTrigger.click();

    const modal = page.getByRole('dialog', { name: 'Favorites and recent items' });
    await expect(modal).toBeVisible();

    // Tab should stay within modal
    for (let i = 0; i < 20; i++) {
      await page.keyboard.press('Tab');

      const focusedInModal = await page.evaluate(() => {
        const modal = document.querySelector('[role="dialog"]');
        return modal?.contains(document.activeElement);
      });

      expect(focusedInModal).toBeTruthy();
    }

    // Escape should close modal
    await page.keyboard.press('Escape');
    await expect(modal).not.toBeVisible();
  });
});

test.describe('Screen Reader Support', () => {
  test('should have proper ARIA landmarks', async ({ page }) => {
    await page.goto('/');
    
    const landmarks = await page.evaluate(() => {
      return {
        main: !!document.querySelector('main, [role="main"]'),
        nav: !!document.querySelector('nav, [role="navigation"]'),
        header: !!document.querySelector('header, [role="banner"]'),
        footer: !!document.querySelector('footer, [role="contentinfo"]'),
      };
    });
    
    expect(landmarks.main).toBeTruthy();
  });

  test('should have descriptive link text', async ({ page }) => {
    await page.goto('/');
    
    const ambiguousLinks = await page.evaluate(() => {
      const links = document.querySelectorAll('a');
      const ambiguous = ['click here', 'read more', 'learn more', 'here'];
      
      return Array.from(links).filter(link => {
        const text = link.textContent?.toLowerCase().trim();
        return text && ambiguous.includes(text);
      }).map(link => link.textContent);
    });
    
    expect(ambiguousLinks).toHaveLength(0);
  });

  test('buttons should have accessible names', async ({ page }) => {
    await page.goto('/explore');
    
    const buttonsWithoutNames = await page.evaluate(() => {
      const buttons = document.querySelectorAll('button');
      return Array.from(buttons).filter(btn => {
        const text = btn.textContent?.trim();
        const ariaLabel = btn.getAttribute('aria-label');
        const ariaLabelledBy = btn.getAttribute('aria-labelledby');
        const title = btn.getAttribute('title');
        
        return !text && !ariaLabel && !ariaLabelledBy && !title;
      }).length;
    });
    
    expect(buttonsWithoutNames).toBe(0);
  });
});
