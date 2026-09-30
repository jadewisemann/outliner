// Copied over the generated MainActivity after `tauri android init`
// (.github/workflows/native.yml). The generated project is not committed —
// this file is the one part of it the app needs to own.
//
// Why: Android 15 draws every app edge to edge, so without this the header
// sits under the status bar and the touch bar under the keyboard. The system
// bars, the display cutout and the keyboard are turned into padding on the
// content view, so the webview is exactly the area the page can use. That
// also makes the page's own layout (the touch bar pinned to the bottom) land
// right above the keyboard, which is where it belongs.
package io.github.jadewisemann.outliner

import android.os.Bundle
import android.view.View
import androidx.activity.enableEdgeToEdge
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat

class MainActivity : TauriActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)
    val content = findViewById<View>(android.R.id.content)
    ViewCompat.setOnApplyWindowInsetsListener(content) { view, insets ->
      val bars = insets.getInsets(
        WindowInsetsCompat.Type.systemBars() or
          WindowInsetsCompat.Type.displayCutout() or
          WindowInsetsCompat.Type.ime()
      )
      view.setPadding(bars.left, bars.top, bars.right, bars.bottom)
      WindowInsetsCompat.CONSUMED
    }
  }
}
